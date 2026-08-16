import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const opportunities = await prisma.donorOpportunity.findMany({
      select: {
        id: true,
        stage: true,
        amount: true,
        probability: true,
      },
    });

    const STAGES = [
      "IDENTIFICATION",
      "QUALIFICATION",
      "CULTIVATION",
      "SOLICITATION",
      "NEGOTIATION",
      "CLOSED_WON",
      "CLOSED_LOST",
    ];

    // Calculate stats by stage
    const statsPerStage: Record<string, any> = {};
    let totalPipeline = 0;
    let totalWeighted = 0;
    let totalClosed = 0;
    let totalWon = 0;

    STAGES.forEach((stage) => {
      const stageOpps = opportunities.filter((opp) => opp.stage === stage);
      const stageValue = stageOpps.reduce((sum, opp) => sum + Number(opp.amount), 0);
      const stageWeighted = stageOpps.reduce(
        (sum, opp) => sum + Number(opp.amount) * (opp.probability / 100),
        0
      );

      statsPerStage[stage] = {
        count: stageOpps.length,
        totalValue: stageValue,
        weightedValue: stageWeighted,
        avgDealSize: stageOpps.length > 0 ? stageValue / stageOpps.length : 0,
      };

      // Only count active stages for pipeline (not closed)
      if (stage !== "CLOSED_WON" && stage !== "CLOSED_LOST") {
        totalPipeline += stageValue;
        totalWeighted += stageWeighted;
      }

      // Track closed opportunities
      if (stage === "CLOSED_WON" || stage === "CLOSED_LOST") {
        totalClosed += stageOpps.length;
        if (stage === "CLOSED_WON") {
          totalWon = stageOpps.length;
        }
      }
    });

    // Find top opportunities
    const topOpportunities = opportunities
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 10)
      .map((opp) => ({
        id: opp.id,
        amount: Number(opp.amount),
        stage: opp.stage,
      }));

    return NextResponse.json({
      totalOpenPipeline: totalPipeline,
      totalWeightedPipeline: totalWeighted,
      countByStage: Object.entries(statsPerStage).reduce(
        (acc: Record<string, number>, [stage, stats]: [string, any]) => {
          acc[stage] = stats.count;
          return acc;
        },
        {} as Record<string, number>
      ),
      averageDealSize: opportunities.length > 0
        ? opportunities.reduce((sum, opp) => sum + Number(opp.amount), 0) / opportunities.length
        : 0,
      conversionRate:
        totalClosed > 0 ? ((totalWon / totalClosed) * 100).toFixed(1) : "0",
      topOpportunities,
      statsPerStage,
      totalOpportunities: opportunities.length,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
