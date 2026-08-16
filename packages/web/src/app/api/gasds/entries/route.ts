import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken, unauthorizedResponse } from "@/lib/api-auth";

/**
 * GET /api/gasds/entries?claimId=...
 * Get all entries for a specific claim
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyApiToken(request);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const claimId = searchParams.get("claimId");

    if (!claimId) {
      return NextResponse.json({ error: "claimId is required" }, { status: 400 });
    }

    const entries = await prisma.gasdsEntry.findMany({
      where: { claimId },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Error fetching GASDS entries:", error);
    return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
  }
}

/**
 * POST /api/gasds/entries
 * Add a new entry to a GASDS claim
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyApiToken(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json();
    const { claimId, date, source, amount, description, donationId, tinLocationId } = body;

    if (!claimId || !date || !source || amount === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: claimId, date, source, amount" },
        { status: 400 }
      );
    }

    // Validate amount
    if (amount <= 0 || amount > 30) {
      return NextResponse.json(
        { error: "Amount must be between £0.01 and £30" },
        { status: 400 }
      );
    }

    // Verify claim exists and is in DRAFT status
    const claim = await prisma.gasdsClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    if (claim.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Can only add entries to draft claims" },
        { status: 403 }
      );
    }

    // Create entry
    const entry = await prisma.gasdsEntry.create({
      data: {
        claimId,
        date: new Date(date),
        source,
        amount,
        description: description || null,
        donationId: donationId || null,
        tinLocationId: tinLocationId || null,
      },
    });

    // Recalculate claim totals
    const entries = await prisma.gasdsEntry.findMany({
      where: { claimId },
    });

    const totalSmallDonations = entries.reduce((sum, e) => sum + Number(e.amount), 0);
    const claimAmount = Math.round(totalSmallDonations * 0.25 * 100) / 100; // 25% rounded to 2 decimals

    await prisma.gasdsClaim.update({
      where: { id: claimId },
      data: {
        totalSmallDonations,
        claimAmount,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Error creating GASDS entry:", error);
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}
