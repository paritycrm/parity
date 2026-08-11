import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: "contact" | "organisation" | "donation" | "case";
  href: string;
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const q = req.nextUrl.searchParams.get("q")?.trim() || "";

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const numericValue = parseFloat(q);
    const isNumeric = !isNaN(numericValue);
    const intValue = parseInt(q, 10);
    const isInt = !isNaN(intValue);

    const [contacts, organisations, donations, cases] = await Promise.all([
      // Contacts: firstName, lastName, email (case-insensitive contains) + exact donorId
      prisma.contact.findMany({
        where: {
          isArchived: false,
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            ...(isInt ? [{ donorId: { equals: intValue } }] : []),
          ],
        },
        select: {
          id: true,
          donorId: true,
          firstName: true,
          lastName: true,
          email: true,
        },
        take: 5,
        orderBy: { lastName: "asc" },
      }),

      // Organisations: name (case-insensitive contains)
      prisma.organisation.findMany({
        where: {
          isArchived: false,
          name: { contains: q, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          type: true,
        },
        take: 5,
        orderBy: { name: "asc" },
      }),

      // Donations: reference (case-insensitive contains) + exact amount match
      prisma.donation.findMany({
        where: {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            ...(isNumeric ? [{ amount: { equals: numericValue } }] : []),
          ],
        },
        select: {
          id: true,
          reference: true,
          amount: true,
          date: true,
          contact: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        take: 5,
        orderBy: { date: "desc" },
      }),

      // Cases: title, caseNumber (case-insensitive contains)
      prisma.caseRecord.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { caseNumber: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          caseNumber: true,
          title: true,
          status: true,
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const results: SearchResult[] = [
      ...contacts.map((c) => ({
        id: c.id,
        title: `${c.firstName} ${c.lastName}`,
        subtitle: c.email || `Donor #${c.donorId}`,
        category: "contact" as const,
        href: `/contacts/${c.id}`,
      })),
      ...organisations.map((o) => ({
        id: o.id,
        title: o.name,
        subtitle: o.type || "Organisation",
        category: "organisation" as const,
        href: `/organisations/${o.id}`,
      })),
      ...donations.map((d) => ({
        id: d.id,
        title: `${d.contact.firstName} ${d.contact.lastName}`,
        subtitle: d.reference
          ? `${d.reference} — £${Number(d.amount).toFixed(2)}`
          : `£${Number(d.amount).toFixed(2)}`,
        category: "donation" as const,
        href: `/donations/${d.id}`,
      })),
      ...cases.map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: `${c.caseNumber} — ${c.status}`,
        category: "case" as const,
        href: `/cases/${c.id}`,
      })),
    ];

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Global search failed:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
