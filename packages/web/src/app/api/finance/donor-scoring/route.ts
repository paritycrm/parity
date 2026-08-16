import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

interface DonorScore {
  contactId: string;
  contactName: string;
  email: string;
  overallScore: number;
  tier: "Platinum" | "Gold" | "Silver" | "Bronze";
  donationFrequency: number;
  totalDonated: number;
  recencyScore: number;
  giftAidStatus: boolean;
  engagementScore: number;
  lastDonationDate: string | null;
  donationCount: number;
}

export async function GET() {
  try {
    await requireAuth();

    // Fetch all contacts with their donation data
    const contacts = await prisma.contact.findMany({
      include: {
        donations: {
          select: {
            id: true,
            amount: true,
            date: true,
            isGiftAidable: true,
            giftAidClaimed: true,
          },
        },
      },
    });

    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const scores: DonorScore[] = contacts
      .map((contact) => {
        const donations = contact.donations || [];
        const donationCount = donations.length;

        if (donationCount === 0) {
          return {
            contactId: contact.id,
            contactName: `${contact.firstName} ${contact.lastName}`.trim(),
            email: contact.email || "",
            overallScore: 0,
            tier: "Bronze" as const,
            donationFrequency: 0,
            totalDonated: 0,
            recencyScore: 0,
            giftAidStatus: false,
            engagementScore: 0,
            lastDonationDate: null,
            donationCount: 0,
          } as DonorScore;
        }

        // Calculate metrics
        const totalDonated = donations.reduce((sum, d) => sum + (d.amount ? Number(d.amount) : 0), 0);

        const lastDonationDate =
          donations.length > 0
            ? new Date(
                Math.max(
                  ...donations.map((d) => new Date(d.date).getTime())
                )
              )
            : null;

        // Recency Score (0-25): How recent was the last donation?
        let recencyScore = 0;
        if (lastDonationDate) {
          const daysSinceLast =
            (now.getTime() - lastDonationDate.getTime()) /
            (1000 * 60 * 60 * 24);
          if (daysSinceLast < 30) recencyScore = 25;
          else if (daysSinceLast < 90) recencyScore = 20;
          else if (daysSinceLast < 180) recencyScore = 15;
          else if (daysSinceLast < 365) recencyScore = 10;
          else recencyScore = 5;
        }

        // Frequency Score (0-25): How often do they donate?
        const donationsInLastYear = donations.filter(
          (d) => new Date(d.date) >= oneYearAgo
        ).length;
        let donationFrequency = 0;
        if (donationsInLastYear >= 12) donationFrequency = 25;
        else if (donationsInLastYear >= 6) donationFrequency = 20;
        else if (donationsInLastYear >= 4) donationFrequency = 15;
        else if (donationsInLastYear >= 2) donationFrequency = 10;
        else if (donationsInLastYear >= 1) donationFrequency = 5;

        // Monetary Score (0-30): Total amount donated
        let monetaryScore = 0;
        if (totalDonated >= 5000) monetaryScore = 30;
        else if (totalDonated >= 2000) monetaryScore = 25;
        else if (totalDonated >= 1000) monetaryScore = 20;
        else if (totalDonated >= 500) monetaryScore = 15;
        else if (totalDonated >= 100) monetaryScore = 10;
        else if (totalDonated > 0) monetaryScore = 5;

        // Gift Aid Score (0-10): Gift Aid status
        const giftAidStatus = donations.some((d) => d.isGiftAidable);
        const giftAidScore = giftAidStatus ? 10 : 0;

        // Engagement Score (0-10): Based on gift aid status and donation recency
        let engagementScore = 0;
        if (donationCount >= 10) engagementScore = 10;
        else if (donationCount >= 5) engagementScore = 8;
        else if (donationCount >= 2) engagementScore = 5;
        else if (donationCount >= 1) engagementScore = 3;

        // Calculate overall score
        const overallScore =
          recencyScore +
          donationFrequency +
          monetaryScore +
          giftAidScore +
          engagementScore;

        // Determine tier
        let tier: "Platinum" | "Gold" | "Silver" | "Bronze";
        if (overallScore >= 80) tier = "Platinum";
        else if (overallScore >= 60) tier = "Gold";
        else if (overallScore >= 40) tier = "Silver";
        else tier = "Bronze";

        return {
          contactId: contact.id,
          contactName: `${contact.firstName} ${contact.lastName}`.trim(),
          email: contact.email || "",
          overallScore,
          tier: tier as "Platinum" | "Gold" | "Silver" | "Bronze",
          donationFrequency,
          totalDonated,
          recencyScore,
          giftAidStatus,
          engagementScore,
          lastDonationDate: lastDonationDate?.toISOString() || null,
          donationCount,
        } as DonorScore;
      })
      .filter((score) => score.donationCount > 0)
      .sort((a, b) => b.overallScore - a.overallScore);

    return NextResponse.json(scores);
  } catch (error) {
    console.error("Donor scoring error:", error);
    return NextResponse.json(
      { error: "Failed to calculate donor scores" },
      { status: 500 }
    );
  }
}
