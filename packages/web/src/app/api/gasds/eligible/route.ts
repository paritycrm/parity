import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken, unauthorizedResponse } from "@/lib/api-auth";

/**
 * GET /api/gasds/eligible?taxYear=2025-26
 * Calculate GASDS eligibility and limits for a given tax year
 *
 * Rules:
 * - Annual limit: min(£8,000, 10 × regular Gift Aid claimed in tax year)
 * - Returns: { annualLimit, regularGiftAid, claimed, remaining, eligible }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyApiToken(request);
    if (!auth) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const taxYear = searchParams.get("taxYear");

    if (!taxYear) {
      return NextResponse.json({ error: "taxYear parameter is required" }, { status: 400 });
    }

    // Parse tax year to get date range (e.g., "2025-26" = 6 Apr 2025 to 5 Apr 2026)
    const [startYearStr, endYearStr] = taxYear.split("-");
    const startYear = parseInt(startYearStr);
    const endYear = parseInt(endYearStr);

    const periodStart = new Date(`${startYear}-04-06`);
    const periodEnd = new Date(`${endYear}-04-05T23:59:59`);

    // Get all regular Gift Aid claims in this tax year
    const giftAidClaims = await prisma.giftAidClaim.findMany({
      where: {
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
        status: { in: ["ACCEPTED", "SUBMITTED"] }, // Only count accepted or submitted
      },
      select: {
        totalClaimable: true,
      },
    });

    const regularGiftAid = giftAidClaims.reduce((sum, claim) => sum + Number(claim.totalClaimable), 0);

    // Calculate annual limit: min(£8,000, 10 × regular Gift Aid)
    const annualLimit = Math.min(8000, regularGiftAid * 10);

    // Get amount already claimed in GASDS for this tax year
    const gasdsClaimsInYear = await prisma.gasdsClaim.findMany({
      where: {
        taxYear,
        status: { in: ["ACCEPTED", "SUBMITTED", "READY"] },
      },
      select: {
        claimAmount: true,
      },
    });

    const claimedAmount = gasdsClaimsInYear.reduce((sum, claim) => sum + Number(claim.claimAmount), 0);

    const remaining = Math.max(0, annualLimit - claimedAmount);
    const eligible = remaining > 0;

    return NextResponse.json({
      taxYear,
      annualLimit,
      regularGiftAid,
      claimed: claimedAmount,
      remaining,
      eligible,
    });
  } catch (error) {
    console.error("Error calculating GASDS eligibility:", error);
    return NextResponse.json({ error: "Failed to calculate eligibility" }, { status: 500 });
  }
}
