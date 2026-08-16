import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/campaigns/analytics
 * Returns aggregate analytics across all campaigns
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    // Get all campaigns with their related data
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: { not: "CANCELLED" },
      },
      include: {
        donations: {
          where: {
            status: "RECEIVED",
          },
          select: {
            amount: true,
          },
        },
      },
    });

    // Calculate aggregate statistics
    let totalBudgetTarget = 0;
    let totalRaised = 0;
    let totalSpent = 0;
    let activeCampaigns = 0;
    let completedCampaigns = 0;

    const campaignMetrics = campaigns.map((campaign) => {
      const totalRaisedForCampaign = campaign.donations.reduce((sum, d) => sum + Number(d.amount), 0);
      const budgetTarget = campaign.budgetTarget ? Number(campaign.budgetTarget) : 0;
      const roi = budgetTarget > 0 ? ((totalRaisedForCampaign - budgetTarget) / budgetTarget) * 100 : 0;
      const donorCount = campaign.donations.length;
      const dacIfBudgetTarget = budgetTarget > 0 && donorCount > 0 ? budgetTarget / donorCount : 0;

      totalBudgetTarget += budgetTarget;
      totalRaised += Number(campaign.actualRaised);
      totalSpent += budgetTarget;

      if (campaign.status === "ACTIVE" || campaign.status === "PAUSED") {
        activeCampaigns++;
      } else if (campaign.status === "COMPLETED") {
        completedCampaigns++;
      }

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        budgetTarget,
        totalRaised: totalRaisedForCampaign,
        roiPercentage: Math.round(roi * 100) / 100,
        donorCount,
        donorAcquisitionCost: Math.round(dacIfBudgetTarget * 100) / 100,
      };
    });

    // Calculate aggregate ROI
    const aggregateRoi = totalSpent > 0 ? ((totalRaised - totalSpent) / totalSpent) * 100 : 0;

    return NextResponse.json({
      summary: {
        totalBudgetTarget,
        totalRaised,
        aggregateRoiPercentage: Math.round(aggregateRoi * 100) / 100,
        activeCampaigns,
        completedCampaigns,
        totalCampaigns: campaigns.length,
      },
      campaigns: campaignMetrics.sort((a, b) => b.totalRaised - a.totalRaised),
    });
  } catch (error) {
    console.error("Campaign analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign analytics" },
      { status: 500 }
    );
  }
}
