import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken, unauthorizedResponse } from "@/lib/api-auth";

/**
 * POST /api/gasds/import-tins
 * Auto-import eligible tin returns as GASDS entries
 *
 * Request body:
 * {
 *   claimId: string,
 *   claimPeriodStart: ISO date string,
 *   claimPeriodEnd: ISO date string
 * }
 *
 * Process:
 * 1. Find TinReturn records within the claim period
 * 2. Split amounts > £30 into multiple £30 chunks
 * 3. Create GasdsEntry records
 * 4. Mark TinReturns as claimed (by storing the claimId reference)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyApiToken(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json();
    const { claimId, claimPeriodStart, claimPeriodEnd } = body;

    if (!claimId || !claimPeriodStart || !claimPeriodEnd) {
      return NextResponse.json(
        { error: "Missing required fields: claimId, claimPeriodStart, claimPeriodEnd" },
        { status: 400 }
      );
    }

    // Verify claim exists and is DRAFT
    const claim = await prisma.gasdsClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    if (claim.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Can only import to draft claims" },
        { status: 403 }
      );
    }

    const periodStart = new Date(claimPeriodStart);
    const periodEnd = new Date(claimPeriodEnd);

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

    // Process each tin return and create entries
    let totalImported = 0;
    let totalAmount = 0;
    const createdEntries = [];

    for (const tinReturn of tinReturns) {
      // Skip if amount is 0
      if (Number(tinReturn.amount) === 0) continue;

      // Split amounts > £30 into multiple entries
      const fullChunks = Math.floor(Number(tinReturn.amount) / 30);
      const remainder = Number(tinReturn.amount) % 30;

      // Create full £30 entries
      for (let i = 0; i < fullChunks; i++) {
        const entry = await prisma.gasdsEntry.create({
          data: {
            claimId,
            date: tinReturn.returnedAt,
            source: "COLLECTION_TIN",
            amount: 30,
            description: `Collection tin #${tinReturn.tin.tinNumber} at ${tinReturn.tin.location?.name || "Unknown"}`,
            tinLocationId: tinReturn.tin.locationId,
          },
        });
        createdEntries.push(entry);
        totalAmount += 30;
        totalImported++;
      }

      // Create remainder entry if any
      if (remainder > 0) {
        const entry = await prisma.gasdsEntry.create({
          data: {
            claimId,
            date: tinReturn.returnedAt,
            source: "COLLECTION_TIN",
            amount: remainder,
            description: `Collection tin #${tinReturn.tin.tinNumber} at ${tinReturn.tin.location?.name || "Unknown"}`,
            tinLocationId: tinReturn.tin.locationId,
          },
        });
        createdEntries.push(entry);
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

    return NextResponse.json({
      success: true,
      imported: totalImported,
      totalAmount,
      entries: createdEntries,
    });
  } catch (error) {
    console.error("Error importing tin returns:", error);
    return NextResponse.json({ error: "Failed to import tin returns" }, { status: 500 });
  }
}
