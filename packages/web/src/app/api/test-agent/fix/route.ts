import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type FixResult = {
  name: string;
  status: "FIXED" | "SKIPPED" | "ERROR";
  detail: string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const maybeUser = await prisma.user.findUnique({ where: { id: session.id } });
  if (!maybeUser || maybeUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { testNames } = await request.json();
  const fixes: FixResult[] = [];

  // Fix: Campaign totals consistent
  if (!testNames || testNames.includes("Campaign totals consistent")) {
    try {
      const campaigns = await prisma.campaign.findMany({
        include: { donations: { where: { status: "RECEIVED" } } },
      });
      let fixedCount = 0;
      for (const c of campaigns) {
        const correctTotal = c.donations.reduce((sum, d) => sum + Number(d.amount), 0);
        const diff = Math.abs(Number(c.actualRaised) - correctTotal);
        if (diff > 0.01) {
          await prisma.campaign.update({
            where: { id: c.id },
            data: { actualRaised: correctTotal },
          });
          fixedCount++;
        }
      }
      if (fixedCount > 0) {
        fixes.push({
          name: "Campaign totals consistent",
          status: "FIXED",
          detail: `Recalculated actualRaised for ${fixedCount} campaign(s) from their donation records`,
        });
      } else {
        fixes.push({
          name: "Campaign totals consistent",
          status: "SKIPPED",
          detail: "All campaign totals already match — no fix needed",
        });
      }
    } catch (e: any) {
      fixes.push({ name: "Campaign totals consistent", status: "ERROR", detail: e.message });
    }
  }

  // Fix: No orphaned donations
  if (!testNames || testNames.includes("No orphaned donations")) {
    try {
      // Find donations with campaignId pointing to non-existent campaigns
      const allCampaignIds = (await prisma.campaign.findMany({ select: { id: true } })).map((c) => c.id);
      const orphaned = await prisma.donation.findMany({
        where: { campaignId: { not: null } },
        select: { id: true, campaignId: true },
      });
      const realOrphans = orphaned.filter((d) => d.campaignId && !allCampaignIds.includes(d.campaignId));

      if (realOrphans.length > 0) {
        await prisma.donation.updateMany({
          where: { id: { in: realOrphans.map((d) => d.id) } },
          data: { campaignId: null },
        });
        fixes.push({
          name: "No orphaned donations",
          status: "FIXED",
          detail: `Cleared invalid campaignId on ${realOrphans.length} donation(s)`,
        });
      } else {
        fixes.push({
          name: "No orphaned donations",
          status: "SKIPPED",
          detail: "No orphaned donations found — no fix needed",
        });
      }
    } catch (e: any) {
      fixes.push({ name: "No orphaned donations", status: "ERROR", detail: e.message });
    }
  }

  return NextResponse.json({ fixes, timestamp: new Date().toISOString() });
}
