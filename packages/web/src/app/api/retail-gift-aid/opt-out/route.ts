import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { token, reason } = await request.json();

    if (!token || !reason) {
      return NextResponse.json(
        { error: "Token and reason are required" },
        { status: 400 }
      );
    }

    const notification = await prisma.retailGiftAidNotification.findUnique({
      where: { token },
      include: {
        claim: { select: { id: true, status: true } },
      },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 404 }
      );
    }

    if (notification.optedOut) {
      return NextResponse.json(
        { error: "Already opted out" },
        { status: 400 }
      );
    }

    // Don't allow opt-out if claim already submitted
    if (["SUBMITTED", "ACCEPTED", "PARTIAL"].includes(notification.claim.status)) {
      return NextResponse.json(
        { error: "This claim has already been submitted to HMRC" },
        { status: 400 }
      );
    }

    // Record the opt-out
    await prisma.retailGiftAidNotification.update({
      where: { token },
      data: {
        optedOut: true,
        optOutAt: new Date(),
        optOutReason: reason,
      },
    });

    // Exclude their items from the claim
    await prisma.giftAidClaimItem.updateMany({
      where: {
        claimId: notification.claimId,
        contactId: notification.contactId,
        status: "INCLUDED",
      },
      data: { status: "EXCLUDED" },
    });

    // Un-claim their donations
    const items = await prisma.giftAidClaimItem.findMany({
      where: {
        claimId: notification.claimId,
        contactId: notification.contactId,
      },
      select: { donationId: true },
    });

    if (items.length > 0) {
      await prisma.donation.updateMany({
        where: { id: { in: items.map((i) => i.donationId) } },
        data: { giftAidClaimed: false },
      });
    }

    // Recalculate claim totals
    const allItems = await prisma.giftAidClaimItem.findMany({
      where: { claimId: notification.claimId },
    });

    const included = allItems.filter((i) => i.status === "INCLUDED");
    const totalDonations = included.reduce((sum, i) => sum + Number(i.donationAmount), 0);
    const totalClaimable = included.reduce((sum, i) => sum + Number(i.giftAidAmount), 0);

    await prisma.giftAidClaim.update({
      where: { id: notification.claimId },
      data: {
        totalDonations,
        totalClaimable,
        donationCount: included.length,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Opt-out error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
