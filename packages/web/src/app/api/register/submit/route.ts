import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function generateOrderNumber(): string {
  const prefix = "ORD";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { formId, eventId, attendee, selections, giftAidDeclared, paymentMethod } = body;

    if (!formId || !eventId || !attendee?.firstName || !attendee?.lastName || !attendee?.email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate form exists and is active
    const form = await prisma.eventRegistrationForm.findUnique({
      where: { id: formId },
      include: { items: true, event: true },
    });

    if (!form || !form.isActive) {
      return NextResponse.json({ error: "Registration form not found or inactive" }, { status: 404 });
    }

    // Find or create contact
    let contact = await prisma.contact.findFirst({
      where: {
        email: { equals: attendee.email, mode: "insensitive" },
        firstName: { equals: attendee.firstName, mode: "insensitive" },
        lastName: { equals: attendee.lastName, mode: "insensitive" },
      },
    });

    // Get a system user for createdById (first admin)
    const systemUser = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });

    if (!systemUser) {
      return NextResponse.json({ error: "System configuration error" }, { status: 500 });
    }

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          email: attendee.email,
          phone: attendee.phone || null,
          addressLine1: attendee.addressLine1 || null,
          city: attendee.city || null,
          postcode: attendee.postcode || null,
          types: ["DONOR"],
          createdById: systemUser.id,
        },
      });
    } else {
      // Update contact info if we have new data
      const updateData: Record<string, string | null> = {};
      if (attendee.phone && !contact.phone) updateData.phone = attendee.phone;
      if (attendee.addressLine1 && !contact.addressLine1) updateData.addressLine1 = attendee.addressLine1;
      if (attendee.city && !contact.city) updateData.city = attendee.city;
      if (attendee.postcode && !contact.postcode) updateData.postcode = attendee.postcode;

      if (Object.keys(updateData).length > 0) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: updateData,
        });
      }
    }

    // Build line items and calculate totals
    const itemMap = new Map(form.items.map((i) => [i.id, i]));
    let subtotal = 0;
    let giftAidTotal = 0;

    const lineItemsData: {
      itemId: string;
      quantity: number;
      unitPrice: number;
      total: number;
      isGiftAidEligible: boolean;
      variant: string | null;
    }[] = [];

    for (const sel of selections || []) {
      const item = itemMap.get(sel.itemId);
      if (!item || sel.quantity <= 0) continue;

      let unitPrice: number;
      let lineTotal: number;

      if (item.type === "DONATION") {
        unitPrice = sel.customAmount || 0;
        lineTotal = unitPrice;
      } else {
        unitPrice = item.price ? Number(item.price) : 0;
        lineTotal = unitPrice * sel.quantity;
      }

      subtotal += lineTotal;
      if (item.isGiftAidEligible) giftAidTotal += lineTotal;

      lineItemsData.push({
        itemId: item.id,
        quantity: sel.quantity,
        unitPrice,
        total: lineTotal,
        isGiftAidEligible: item.isGiftAidEligible,
        variant: sel.variant || null,
      });

      // Update merchandise sold count
      if (item.type === "MERCHANDISE") {
        await prisma.eventFormItem.update({
          where: { id: item.id },
          data: {
            maxQuantity: item.maxQuantity
              ? Math.max(0, item.maxQuantity - sel.quantity)
              : item.maxQuantity,
          },
        });
      }
    }

    const orderNumber = generateOrderNumber();
    const isFree = subtotal === 0;

    // Create order with line items
    const order = await prisma.eventOrder.create({
      data: {
        formId,
        contactId: contact.id,
        eventId,
        orderNumber,
        subtotal,
        giftAidTotal: giftAidDeclared ? giftAidTotal : 0,
        totalAmount: subtotal,
        status: isFree ? "CONFIRMED" : "PENDING",
        paymentStatus: isFree ? "FREE" : "UNPAID",
        paymentMethod: isFree ? "FREE" : paymentMethod || null,
        attendeeName: `${attendee.firstName} ${attendee.lastName}`,
        attendeeEmail: attendee.email,
        attendeePhone: attendee.phone || null,
        attendeeAddress: attendee.addressLine1
          ? [attendee.addressLine1, attendee.city, attendee.postcode]
              .filter(Boolean)
              .join(", ")
          : null,
        giftAidDeclared: giftAidDeclared || false,
        lineItems: {
          create: lineItemsData,
        },
      },
    });

    // Create EventAttendee record
    const existingAttendee = await prisma.eventAttendee.findUnique({
      where: { eventId_contactId: { eventId, contactId: contact.id } },
    });

    if (!existingAttendee) {
      await prisma.eventAttendee.create({
        data: {
          eventId,
          contactId: contact.id,
          status: isFree ? "CONFIRMED" : "REGISTERED",
          ticketType: "ONLINE_REGISTRATION",
        },
      });
    }

    // Create donation records for gift-aid-eligible line items
    for (const lineItem of lineItemsData) {
      if (lineItem.total > 0) {
        const item = itemMap.get(lineItem.itemId);
        const donationType =
          item?.type === "DONATION"
            ? "DONATION"
            : item?.type === "REGISTRATION_FEE"
            ? "EVENT_FEE"
            : "PAYMENT";

        await prisma.donation.create({
          data: {
            contactId: contact.id,
            amount: lineItem.total,
            type: donationType,
            method: "ONLINE",
            date: new Date(),
            eventId,
            isGiftAidable: lineItem.isGiftAidEligible && giftAidDeclared,
            giftAidClaimed: false,
            status: isFree ? "RECEIVED" : "PENDING",
            notes: `${item?.name || "Item"} - Order ${orderNumber}`,
            createdById: systemUser.id,
          },
        });
      }
    }

    // ── Create / update Event P&L income lines ──────────────
    // Map form item types to P&L income categories
    const TYPE_TO_CATEGORY: Record<string, string> = {
      REGISTRATION_FEE: "REGISTRATION_FEES",
      MERCHANDISE: "MERCHANDISE",
      DONATION: "DONATIONS_ON_DAY",
    };

    // Group line items by category for aggregation
    const categoryTotals = new Map<string, { category: string; label: string; amount: number }>();

    for (const lineItem of lineItemsData) {
      const item = itemMap.get(lineItem.itemId);
      if (!item || lineItem.total <= 0) continue;

      const category = TYPE_TO_CATEGORY[item.type] || "OTHER";
      const existing = categoryTotals.get(category);
      if (existing) {
        existing.amount += lineItem.total;
      } else {
        const label =
          category === "REGISTRATION_FEES"
            ? "Registration Fees"
            : category === "MERCHANDISE"
            ? "Merchandise Sales"
            : category === "DONATIONS_ON_DAY"
            ? "Donations"
            : item.name;
        categoryTotals.set(category, { category, label, amount: lineItem.total });
      }
    }

    // For each category, find existing income line or create one, then add the amount
    for (const { category, label, amount } of categoryTotals.values()) {
      const existingLine = await prisma.eventIncomeLine.findFirst({
        where: { eventId, category },
      });

      if (existingLine) {
        await prisma.eventIncomeLine.update({
          where: { id: existingLine.id },
          data: { actual: Number(existingLine.actual) + amount },
        });
      } else {
        await prisma.eventIncomeLine.create({
          data: {
            eventId,
            category,
            label,
            actual: amount,
          },
        });
      }
    }

    // If gift aid declared and no existing declaration, create one
    if (giftAidDeclared && giftAidTotal > 0) {
      const existingGiftAid = await prisma.giftAid.findFirst({
        where: { contactId: contact.id, status: "ACTIVE" },
      });

      if (!existingGiftAid) {
        await prisma.giftAid.create({
          data: {
            contactId: contact.id,
            declarationDate: new Date(),
            startDate: new Date(),
            status: "ACTIVE",
            source: "DIGITAL",
            digitalSignedAt: new Date(),
            digitalSignedName: `${attendee.firstName} ${attendee.lastName}`,
            notes: `Digital declaration via event registration form - ${form.event.name}`,
            createdById: systemUser.id,
          },
        });
      }
    }

    // If payment is required and not free, in the future this would
    // redirect to Stripe/GoCardless. For now, auto-confirm.
    if (!isFree) {
      // TODO: Integrate Stripe Checkout / GoCardless payment flow
      // For now, mark as paid for testing
      await prisma.eventOrder.update({
        where: { id: order.id },
        data: {
          status: "CONFIRMED",
          paymentStatus: "PAID",
          paymentReference: `MOCK-${Date.now()}`,
        },
      });

      // Also update donation statuses
      await prisma.donation.updateMany({
        where: { eventId, contactId: contact.id, status: "PENDING" },
        data: { status: "RECEIVED" },
      });

      // Update attendee status
      await prisma.eventAttendee.updateMany({
        where: { eventId, contactId: contact.id, status: "REGISTERED" },
        data: { status: "CONFIRMED" },
      });
    }

    return NextResponse.json({
      success: true,
      orderNumber,
      orderId: order.id,
    });
  } catch (error) {
    console.error("[register/submit] Error:", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
