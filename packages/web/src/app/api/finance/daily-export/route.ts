import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  await requireAuth();

  const dateStr = req.nextUrl.searchParams.get("date");
  if (!dateStr) {
    return NextResponse.json({ error: "date parameter required" }, { status: 400 });
  }

  const startOfDay = new Date(dateStr + "T00:00:00.000Z");
  const endOfDay = new Date(dateStr + "T23:59:59.999Z");

  const donations = await prisma.donation.findMany({
    where: {
      date: { gte: startOfDay, lte: endOfDay },
      status: { not: "CANCELLED" },
    },
    include: {
      contact: { select: { firstName: true, lastName: true } },
      ledgerCode: { select: { code: true, name: true } },
      campaign: { select: { name: true } },
      event: { select: { name: true } },
      bankDocument: { select: { reference: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const mapped = donations.map((d) => ({
    id: d.id,
    date: d.date.toISOString(),
    contactName: `${d.contact.firstName} ${d.contact.lastName}`,
    type: d.type,
    method: d.method,
    reference: d.reference,
    amount: Number(d.amount),
    ledgerCode: d.ledgerCode?.code || null,
    ledgerName: d.ledgerCode?.name || null,
    campaignName: d.campaign?.name || null,
    eventName: d.event?.name || null,
    bankDocRef: d.bankDocument?.reference || null,
    isGiftAidable: d.isGiftAidable,
  }));

  return NextResponse.json({ donations: mapped });
}
