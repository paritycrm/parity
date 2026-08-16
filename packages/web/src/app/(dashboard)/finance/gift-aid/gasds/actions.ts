"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";

/**
 * Server action to import tin returns as GASDS entries
 */
export async function importTinReturnsToGasds(claimId: string, periodStart: Date, periodEnd: Date) {
  const user = await requireAuth();

  // Verify claim exists and belongs to user
  const claim = await prisma.gasdsClaim.findUnique({
    where: { id: claimId },
  });

  if (!claim) throw new Error("Claim not found");
  if (claim.createdById !== user.id) throw new Error("Unauthorized");
  if (claim.status !== "DRAFT") throw new Error("Can only import to draft claims");

  // Find tin returns within the period
  const tinReturns = await prisma.tinReturn.findMany({
    where: {
      returnedAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    include: {
      tin: {
        include: {
          location: true,
        },
      },
    },
  });

  let totalImported = 0;
  let totalAmount = 0;

  // Process each tin return
  for (const tinReturn of tinReturns) {
    if (Number(tinReturn.amount) === 0) continue;

    // Split amounts > £30
    const fullChunks = Math.floor(Number(tinReturn.amount) / 30);
    const remainder = Number(tinReturn.amount) % 30;

    // Create full £30 entries
    for (let i = 0; i < fullChunks; i++) {
      await prisma.gasdsEntry.create({
        data: {
          claimId,
          date: tinReturn.returnedAt,
          source: "COLLECTION_TIN",
          amount: 30,
          description: `Collection tin #${tinReturn.tin.tinNumber} at ${tinReturn.tin.location?.name || "Unknown"}`,
          tinLocationId: tinReturn.tin.locationId,
        },
      });
      totalAmount += 30;
      totalImported++;
    }

    // Create remainder entry
    if (remainder > 0) {
      await prisma.gasdsEntry.create({
        data: {
          claimId,
          date: tinReturn.returnedAt,
          source: "COLLECTION_TIN",
          amount: remainder,
          description: `Collection tin #${tinReturn.tin.tinNumber} at ${tinReturn.tin.location?.name || "Unknown"}`,
          tinLocationId: tinReturn.tin.locationId,
        },
      });
      totalAmount += remainder;
      totalImported++;
    }
  }

  // Recalculate claim totals
  const allEntries = await prisma.gasdsEntry.findMany({
    where: { claimId },
  });

  const totalSmallDonations = allEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  const claimAmount = Math.round(totalSmallDonations * 0.25 * 100) / 100;

  await prisma.gasdsClaim.update({
    where: { id: claimId },
    data: {
      totalSmallDonations,
      claimAmount,
    },
  });

  return {
    success: true,
    imported: totalImported,
    totalAmount,
  };
}

/**
 * Server action to get small cash donations not yet in GASDS
 */
export async function getEligibleCashDonations(taxYear: string) {
  const user = await requireAuth();

  // Parse tax year
  const [startYear, endYearStr] = taxYear.split("-");
  const startYearNum = parseInt(startYear);
  const endYearNum = parseInt(`20${endYearStr}`);

  const periodStart = new Date(`${startYearNum}-04-06`);
  const periodEnd = new Date(`${endYearNum}-04-05T23:59:59`);

  // Find donations that are:
  // 1. Between £0.01 and £30
  // 2. Cash or contactless method
  // 3. Not already in a GASDS claim
  // 4. Within the tax year
  // 5. Gift aid eligible
  const donations = await prisma.donation.findMany({
    where: {
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
      amount: {
        gt: 0,
        lte: 30,
      },
      OR: [
        { method: { in: ["CASH", "ONLINE"] } },
        { method: null },
      ],
      isGiftAidable: true,
      giftAidClaimed: false,
      // Exclude donations already in GASDS entries
      NOT: {
        id: {
          in: (await prisma.gasdsEntry.findMany({
            where: { donationId: { not: null } },
            select: { donationId: true },
          })).map(e => e.donationId!),
        },
      },
    },
    include: {
      contact: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  return donations;
}

/**
 * Server action to export claim as PDF (placeholder)
 */
export async function exportClaimAsPdf(claimId: string): Promise<Buffer> {
  const user = await requireAuth();

  const claim = await prisma.gasdsClaim.findUnique({
    where: { id: claimId },
    include: {
      entries: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  if (!claim) throw new Error("Claim not found");
  if (claim.createdById !== user.id) throw new Error("Unauthorized");

  // TODO: Generate PDF using a library like pdfkit or puppeteer
  // For now, return empty buffer
  return Buffer.from("");
}
