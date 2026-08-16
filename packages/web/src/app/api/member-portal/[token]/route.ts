import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/member-portal/[token] - Get member data (public, no auth required)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Find the portal token
    const portalToken = await prisma.memberPortalToken.findUnique({
      where: { token },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            postcode: true,
            country: true,
          },
        },
      },
    });

    if (!portalToken) {
      return NextResponse.json(
        { error: "Invalid or expired portal link" },
        { status: 404 }
      );
    }

    // Check if token has expired
    if (portalToken.expiresAt && portalToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Portal link has expired" },
        { status: 410 }
      );
    }

    const { contact } = portalToken;
    const contactId = contact.id;

    // Fetch membership information
    const membership = await prisma.membership.findFirst({
      where: { contactId },
      include: { membershipType: true },
      orderBy: { createdAt: "desc" },
    });

    // Fetch donations from the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const donations = await prisma.donation.findMany({
      where: {
        contactId,
        date: { gte: twelveMonthsAgo },
        status: "RECEIVED",
      },
      orderBy: { date: "desc" },
    });

    // Calculate donation summary
    const donationCount = donations.length;
    const donationTotal = donations.reduce((sum, d) => sum + Number(d.amount), 0);

    return NextResponse.json({
      contactId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      address: {
        line1: contact.addressLine1,
        line2: contact.addressLine2,
        city: contact.city,
        postcode: contact.postcode,
        country: contact.country,
      },
      membership: membership
        ? {
            id: membership.id,
            memberNumber: membership.memberNumber,
            type: membership.membershipType?.name,
            status: membership.status,
            startDate: membership.startDate,
            endDate: membership.endDate,
            renewalDate: membership.renewalDate,
            autoRenew: membership.autoRenew,
          }
        : null,
      donationSummary: {
        count: donationCount,
        total: donationTotal,
        currency: "GBP",
      },
    });
  } catch (error) {
    console.error("Failed to fetch member data:", error);
    return NextResponse.json(
      { error: "Failed to fetch member data" },
      { status: 500 }
    );
  }
}

// PUT /api/member-portal/[token] - Update profile (public, no auth required)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();

    // Find the portal token
    const portalToken = await prisma.memberPortalToken.findUnique({
      where: { token },
    });

    if (!portalToken) {
      return NextResponse.json(
        { error: "Invalid or expired portal link" },
        { status: 404 }
      );
    }

    // Check if token has expired
    if (portalToken.expiresAt && portalToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Portal link has expired" },
        { status: 410 }
      );
    }

    const { firstName, lastName, email, phone, addressLine1, addressLine2, city, postcode, country } = body;

    // Build update data - only update provided fields
    const updateData: any = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (addressLine1 !== undefined) updateData.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) updateData.addressLine2 = addressLine2;
    if (city !== undefined) updateData.city = city;
    if (postcode !== undefined) updateData.postcode = postcode;
    if (country !== undefined) updateData.country = country;

    // Update contact profile
    const updatedContact = await prisma.contact.update({
      where: { id: portalToken.contactId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        postcode: true,
        country: true,
      },
    });

    return NextResponse.json({
      success: true,
      contactId: updatedContact.id,
      firstName: updatedContact.firstName,
      lastName: updatedContact.lastName,
      email: updatedContact.email,
      phone: updatedContact.phone,
      address: {
        line1: updatedContact.addressLine1,
        line2: updatedContact.addressLine2,
        city: updatedContact.city,
        postcode: updatedContact.postcode,
        country: updatedContact.country,
      },
    });
  } catch (error) {
    console.error("Failed to update member profile:", error);
    return NextResponse.json(
      { error: "Failed to update member profile" },
      { status: 500 }
    );
  }
}
