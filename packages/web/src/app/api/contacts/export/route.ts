// packages/web/src/app/api/contacts/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  await requireAuth();

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search") || "";
  const typeFilter = searchParams.get("type") || "";
  const lotteryFilter = searchParams.get("lottery") || "";
  const missingFilter = searchParams.get("missing") || "";
  const archivedFilter = searchParams.get("archived") || "";

  // Build the same where clause as the contacts list page
  const where = {
    AND: [
      search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { postcode: { contains: search, mode: "insensitive" as const } },
              ...(!isNaN(parseInt(search, 10))
                ? [{ donorId: { equals: parseInt(search, 10) } }]
                : []),
            ],
          }
        : {},
      typeFilter ? { types: { has: typeFilter } } : {},
      lotteryFilter === "yes" ? { isLotteryMember: true } : {},
      missingFilter === "phone"
        ? { OR: [{ phone: null }, { phone: "" }] }
        : {},
      missingFilter === "email"
        ? { OR: [{ email: null }, { email: "" }] }
        : {},
      // Only show archived contacts when explicitly requested
      archivedFilter === "true" ? {} : { isArchived: false },
    ],
  };

  const contacts = await prisma.contact.findMany({
    where,
    include: {
      organisation: { select: { name: true } },
      tags: { include: { tag: { select: { name: true } } } },
      donations: { select: { amount: true } },
      volunteerProfile: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    // No take limit for export — fetch all matching contacts
  });

  // CSV header row
  const headers = [
    "Donor ID",
    "Title",
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Mobile",
    "Address Line 1",
    "Address Line 2",
    "City",
    "Postcode",
    "Country",
    "Date of Birth",
    "Types",
    "Organisation",
    "Tags",
    "Total Donated",
    "Is Archived",
  ];

  const rows = contacts.map((contact) => {
    const totalDonated = contact.donations.reduce(
      (sum, d) => sum + Number(d.amount),
      0
    );
    const tagNames = contact.tags.map((ct) => ct.tag.name).join("; ");
    const types = contact.types.join("; ");

    return [
      escapeCsv(String(contact.donorId).padStart(5, "0")),
      escapeCsv(contact.title),
      escapeCsv(contact.firstName),
      escapeCsv(contact.lastName),
      escapeCsv(contact.email),
      escapeCsv(contact.phone),
      escapeCsv(contact.mobile),
      escapeCsv(contact.addressLine1),
      escapeCsv(contact.addressLine2),
      escapeCsv(contact.city),
      escapeCsv(contact.postcode),
      escapeCsv(contact.country),
      escapeCsv(contact.dateOfBirth),
      escapeCsv(types),
      escapeCsv(contact.organisation?.name),
      escapeCsv(tagNames),
      escapeCsv(totalDonated.toFixed(2)),
      escapeCsv(contact.isArchived ? "Yes" : "No"),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\r\n");

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `contacts-export-${timestamp}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
