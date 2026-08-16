import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken, unauthorizedResponse } from "@/lib/api-auth";

/**
 * PUT /api/gasds/entries/[id]
 * Update a GASDS entry
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await verifyApiToken(request);
    if (!auth) return unauthorizedResponse();

    const body = await request.json();
    const { date, source, amount, description } = body;

    // Verify entry exists
    const entry = await prisma.gasdsEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Verify claim is in DRAFT status
    const claim = await prisma.gasdsClaim.findUnique({
      where: { id: entry.claimId },
    });

    if (!claim || claim.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Can only edit entries in draft claims" },
        { status: 403 }
      );
    }

    // Validate amount if provided
    if (amount !== undefined && (amount <= 0 || amount > 30)) {
      return NextResponse.json(
        { error: "Amount must be between £0.01 and £30" },
        { status: 400 }
      );
    }

    // Update entry
    const updateData: any = {};
    if (date !== undefined) updateData.date = new Date(date);
    if (source !== undefined) updateData.source = source;
    if (amount !== undefined) updateData.amount = amount;
    if (description !== undefined) updateData.description = description;

    const updated = await prisma.gasdsEntry.update({
      where: { id },
      data: updateData,
    });

    // Recalculate claim totals
    const entries = await prisma.gasdsEntry.findMany({
      where: { claimId: entry.claimId },
    });

    const totalSmallDonations = entries.reduce((sum, e) => sum + Number(e.amount), 0);
    const claimAmount = Math.round(totalSmallDonations * 0.25 * 100) / 100;

    await prisma.gasdsClaim.update({
      where: { id: entry.claimId },
      data: {
        totalSmallDonations,
        claimAmount,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating GASDS entry:", error);
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

/**
 * DELETE /api/gasds/entries/[id]
 * Delete a GASDS entry
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await verifyApiToken(request);
    if (!auth) return unauthorizedResponse();

    // Verify entry exists
    const entry = await prisma.gasdsEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Verify claim is in DRAFT status
    const claim = await prisma.gasdsClaim.findUnique({
      where: { id: entry.claimId },
    });

    if (!claim || claim.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Can only delete entries in draft claims" },
        { status: 403 }
      );
    }

    const claimId = entry.claimId;

    // Delete entry
    await prisma.gasdsEntry.delete({
      where: { id },
    });

    // Recalculate claim totals
    const entries = await prisma.gasdsEntry.findMany({
      where: { claimId },
    });

    const totalSmallDonations = entries.reduce((sum, e) => sum + Number(e.amount), 0);
    const claimAmount = Math.round(totalSmallDonations * 0.25 * 100) / 100;

    await prisma.gasdsClaim.update({
      where: { id: claimId },
      data: {
        totalSmallDonations,
        claimAmount,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting GASDS entry:", error);
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}
