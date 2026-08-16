import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { executeAutomations } from "@/lib/automation";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const body = await req.json();

  const {
    contactId,
    amount,
    type,
    method,
    reference,
    date,
    ledgerCodeId,
    campaignId,
    eventId,
    isGiftAidable,
    notes,
    bankDocumentId,
  } = body;

  if (!contactId || !amount || !type || !date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const donation = await prisma.donation.create({
    data: {
      contactId,
      amount: parseFloat(amount),
      currency: "GBP",
      type,
      method: method || null,
      reference: reference || null,
      date: new Date(date),
      ledgerCodeId: ledgerCodeId || null,
      campaignId: campaignId || null,
      eventId: eventId || null,
      isGiftAidable: !!isGiftAidable,
      notes: notes || null,
      bankDocumentId: bankDocumentId || null,
      createdById: session.id,
    },
    include: {
      contact: { select: { firstName: true, lastName: true, donorId: true } },
    },
  });

  // Update campaign total
  if (campaignId) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { actualRaised: { increment: parseFloat(amount) } },
    });
  }

  await logAudit({
    userId: session.id,
    action: "CREATE",
    entityType: "Donation",
    entityId: donation.id,
    details: { amount: parseFloat(amount), type },
  });

  // Trigger automations
  await executeAutomations("DONATION_RECEIVED", {
    contactId: donation.contactId,
    amount: Number(donation.amount),
    campaignId: donation.campaignId ?? undefined,
    donationType: donation.type,
    donationId: donation.id,
    eventId: donation.eventId ?? undefined,
  });

  return NextResponse.json({
    id: donation.id,
    amount: Number(donation.amount),
    contactName: `${donation.contact.firstName} ${donation.contact.lastName}`,
    donorId: donation.contact.donorId,
    type: donation.type,
    method: donation.method,
  });
}
