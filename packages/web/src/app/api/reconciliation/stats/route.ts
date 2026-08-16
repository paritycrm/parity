import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const sessionId = req.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Get reconciliation session
    const session = await prisma.reconciliationSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get transaction statistics
    const totalTransactions = await prisma.bankTransaction.count({
      where: { importBatch: sessionId },
    });

    const matchedCount = await prisma.bankTransaction.count({
      where: {
        importBatch: sessionId,
        status: "MATCHED",
      },
    });

    const unmatchedCount = await prisma.bankTransaction.count({
      where: {
        importBatch: sessionId,
        status: "UNMATCHED",
      },
    });

    const excludedCount = await prisma.bankTransaction.count({
      where: {
        importBatch: sessionId,
        status: "EXCLUDED",
      },
    });

    // Get totals
    const matchedTransactions = await prisma.bankTransaction.findMany({
      where: {
        importBatch: sessionId,
        status: "MATCHED",
      },
      select: { amount: true },
    });

    const unmatchedTransactions = await prisma.bankTransaction.findMany({
      where: {
        importBatch: sessionId,
        status: "UNMATCHED",
      },
      select: { amount: true },
    });

    const totalAmount = await prisma.bankTransaction.aggregate({
      where: { importBatch: sessionId },
      _sum: { amount: true },
    });

    const matchedAmount = matchedTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const unmatchedAmount = unmatchedTransactions.reduce((sum, t) => sum + Number(t.amount), 0);

    const matchRate = totalTransactions > 0
      ? Math.round((matchedCount / totalTransactions) * 100)
      : 0;

    return NextResponse.json({
      session,
      stats: {
        totalTransactions,
        matchedCount,
        unmatchedCount,
        excludedCount,
        matchRate,
        totalAmount: totalAmount._sum.amount ? Number(totalAmount._sum.amount) : 0,
        matchedAmount,
        unmatchedAmount,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
