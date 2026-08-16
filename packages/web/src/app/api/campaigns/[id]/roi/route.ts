import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";

interface Params {
  id: string;
}

/**
 * GET /api/campaigns/[id]/roi
 * Returns ROI data for a specific campaign
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    await requireAuth();

    const { id } = await params;

    // Fetch campaign with donation data
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        donations: {
          where: {
            status: "RECEIVED",
          },
          select: {
            amount: true,
            id: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Calculate ROI metrics
    const budgetTarget = campaign.budgetTarget ? Number(campaign.budgetTarget) : 0;
    const actualRaised = campaign.donations.reduce((sum, d) => sum + Number(d.amount), 0);
    const donorCount = campaign.donations.length;
    const roiPercentage = budgetTarget > 0 ? ((actualRaised - budgetTarget) / budgetTarget) * 100 : 0;
    const dacDivisor = donorCount > 0 ? donorCount : 1;
    const donorAcquisitionCost = budgetTarget > 0 ? budgetTarget / dacDivisor : 0;
    const conversionRate = donorCount > 0 ? ((donorCount / (budgetTarget * 1000)) * 100) : 0;

    return NextResponse.json({
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      budgetTarget,
      totalRaised: actualRaised,
      roiPercentage: Math.round(roiPercentage * 100) / 100,
      donorCount,
      donorAcquisitionCost: Math.round(donorAcquisitionCost * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      profitLoss: actualRaised - budgetTarget,
    });
  } catch (error) {
    console.error("Campaign ROI error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign ROI data" },
      { status: 500 }
    );
  }
}
