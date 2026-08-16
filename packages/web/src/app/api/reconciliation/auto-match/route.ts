import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

interface MatchCandidate {
  id: string;
  type: "DONATION" | "PAYMENT";
  amount: number;
  date: Date;
  description?: string | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();

    const body = await req.json();
    const { sessionId, transactionIds } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Get unmatched transactions for the session
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        status: "UNMATCHED",
        importBatch: sessionId,
        ...(transactionIds && { id: { in: transactionIds } }),
      },
    });

    if (transactions.length === 0) {
      return NextResponse.json({
        success: true,
        matches: [],
        message: "No unmatched transactions found",
      });
    }

    const matches: Record<string, MatchCandidate[]> = {};

    // For each transaction, find potential matches
    for (const txn of transactions) {
      const candidates = await findMatchCandidates(txn);
      if (candidates.length > 0) {
        matches[txn.id] = candidates;
      }
    }

    return NextResponse.json({
      success: true,
      totalTransactions: transactions.length,
      transactionsWithMatches: Object.keys(matches).length,
      matches,
    });
  } catch (error) {
    console.error("Error in auto-match:", error);
    return NextResponse.json(
      { error: "Failed to run auto-match" },
      { status: 500 }
    );
  }
}

/**
 * Find match candidates for a bank transaction
 */
async function findMatchCandidates(
  transaction: any
): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];

  // 1. Exact amount + date within 3 days (HIGH confidence)
  const exactMatches = await prisma.donation.findMany({
    where: {
      amount: transaction.amount,
      date: {
        gte: new Date(transaction.date.getTime() - 3 * 24 * 60 * 60 * 1000),
        lte: new Date(transaction.date.getTime() + 3 * 24 * 60 * 60 * 1000),
      },
    },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    take: 5,
  });

  candidates.push(
    ...exactMatches.map((d) => ({
      id: d.id,
      type: "DONATION" as const,
      amount: Number(d.amount),
      date: d.date,
      description: d.notes,
      contact: d.contact,
      confidence: "HIGH" as const,
    }))
  );

  // 2. Exact amount on payment (HIGH confidence)
  const paymentMatches = await prisma.payment.findMany({
    where: {
      amount: transaction.amount,
      status: "SUCCEEDED",
      paidAt: {
        gte: new Date(transaction.date.getTime() - 3 * 24 * 60 * 60 * 1000),
        lte: new Date(transaction.date.getTime() + 3 * 24 * 60 * 60 * 1000),
      },
    },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    take: 5,
  });

  candidates.push(
    ...paymentMatches.map((p) => ({
      id: p.id,
      type: "PAYMENT" as const,
      amount: Number(p.amount),
      date: p.paidAt || new Date(),
      description: p.description,
      contact: p.contact,
      confidence: "HIGH" as const,
    }))
  );

  // 3. Reference match (MEDIUM confidence)
  if (transaction.reference) {
    const refMatches = await prisma.donation.findMany({
      where: {
        reference: {
          contains: transaction.reference,
          mode: "insensitive",
        },
      },
      include: { contact: { select: { id: true, firstName: true, lastName: true } } },
      take: 5,
    });

    for (const d of refMatches) {
      // Only add if not already in candidates
      if (
        !candidates.some(
          (c) => c.id === d.id && c.type === "DONATION"
        )
      ) {
        candidates.push({
          id: d.id,
          type: "DONATION",
          amount: Number(d.amount),
          date: d.date,
          description: d.notes,
          contact: d.contact,
          confidence: "MEDIUM",
        });
      }
    }
  }

  // 4. Amount range match (MEDIUM confidence) - within 5%
  const amountRange = Number(transaction.amount) * 0.05;
  const rangeMatches = await prisma.donation.findMany({
    where: {
      amount: {
        gte: Number(transaction.amount) - amountRange,
        lte: Number(transaction.amount) + amountRange,
      },
      date: {
        gte: new Date(transaction.date.getTime() - 7 * 24 * 60 * 60 * 1000),
        lte: new Date(transaction.date.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    take: 5,
  });

  for (const d of rangeMatches) {
    // Only add if not already in candidates
    if (
      !candidates.some(
        (c) => c.id === d.id && c.type === "DONATION"
      )
    ) {
      candidates.push({
        id: d.id,
        type: "DONATION",
        amount: Number(d.amount),
        date: d.date,
        description: d.notes,
        contact: d.contact,
        confidence: "LOW",
      });
    }
  }

  // Sort by confidence and date proximity
  candidates.sort((a, b) => {
    const confidenceOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    }

    // Sort by date proximity
    const aDateDiff = Math.abs(a.date.getTime() - transaction.date.getTime());
    const bDateDiff = Math.abs(b.date.getTime() - transaction.date.getTime());
    return aDateDiff - bDateDiff;
  });

  return candidates.slice(0, 10); // Return top 10 candidates
}
