import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { formatDate } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !session.contactId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const taxYear = parseInt(request.nextUrl.searchParams.get("taxYear") || "2025");
  const taxYearStart = new Date(taxYear, 3, 6);
  const taxYearEnd = new Date(taxYear + 1, 3, 5, 23, 59, 59);

  const donations = await prisma.donation.findMany({
    where: {
      contactId: session.contactId,
      status: { in: ["RECEIVED", "PENDING"] },
      date: { gte: taxYearStart, lte: taxYearEnd },
    },
    orderBy: { date: "asc" },
    include: { event: true, campaign: true },
  });

  const contact = await prisma.contact.findUnique({
    where: { id: session.contactId },
    select: { firstName: true, lastName: true },
  });

  // Build CSV
  const rows = [
    ["Date", "Type", "For", "Amount", "Gift Aid Eligible", "Gift Aid Value"].join(","),
    ...donations.map((d) => {
      const giftAidValue = d.isGiftAidable ? (Number(d.amount) * 0.25).toFixed(2) : "0.00";
      return [
        formatDate(d.date),
        d.type.replace("_", " "),
        `"${d.event?.name || d.campaign?.name || "General"}"`,
        Number(d.amount).toFixed(2),
        d.isGiftAidable ? "Yes" : "No",
        giftAidValue,
      ].join(",");
    }),
  ];

  // Add totals row
  const total = donations.reduce((s, d) => s + Number(d.amount), 0);
  const giftAidTotal = donations.filter((d) => d.isGiftAidable).reduce((s, d) => s + Number(d.amount) * 0.25, 0);
  rows.push("");
  rows.push(["", "", "Total", total.toFixed(2), "", giftAidTotal.toFixed(2)].join(","));

  const csv = rows.join("\n");
  const filename = `donations-${contact?.firstName}-${contact?.lastName}-${taxYear}-${taxYear + 1}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
