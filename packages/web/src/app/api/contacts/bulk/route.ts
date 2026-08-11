// Goes to: packages/web/src/app/api/contacts/bulk/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    action: "tag" | "archive" | "delete" | "export";
    contactIds: string[];
    tagId?: string;
    tagName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { action, contactIds, tagId, tagName } = body;

  if (!action || !contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "action and contactIds are required" },
      { status: 400 }
    );
  }

  if (!["tag", "archive", "delete", "export"].includes(action)) {
    return NextResponse.json(
      { success: false, error: "Invalid action. Must be tag, archive, delete, or export" },
      { status: 400 }
    );
  }

  try {
    // ── TAG ──────────────────────────────────────────────────────────
    if (action === "tag") {
      let resolvedTagId = tagId;

      if (!resolvedTagId && tagName) {
        // Find existing tag or create a new one
        const existing = await prisma.tag.findUnique({
          where: { name: tagName },
        });
        if (existing) {
          resolvedTagId = existing.id;
        } else {
          const newTag = await prisma.tag.create({
            data: { name: tagName },
          });
          resolvedTagId = newTag.id;
        }
      }

      if (!resolvedTagId) {
        return NextResponse.json(
          { success: false, error: "tagId or tagName is required for tag action" },
          { status: 400 }
        );
      }

      // Get existing contact-tag pairs to avoid duplicates
      const existingPairs = await prisma.contactTag.findMany({
        where: {
          contactId: { in: contactIds },
          tagId: resolvedTagId,
        },
        select: { contactId: true },
      });
      const alreadyTagged = new Set(existingPairs.map((p) => p.contactId));
      const toCreate = contactIds.filter((id) => !alreadyTagged.has(id));

      if (toCreate.length > 0) {
        await prisma.contactTag.createMany({
          data: toCreate.map((contactId) => ({
            contactId,
            tagId: resolvedTagId!,
          })),
          skipDuplicates: true,
        });
      }

      return NextResponse.json({
        success: true,
        affected: toCreate.length,
      });
    }

    // ── ARCHIVE ─────────────────────────────────────────────────────
    if (action === "archive") {
      const result = await prisma.contact.updateMany({
        where: { id: { in: contactIds } },
        data: { isArchived: true },
      });

      return NextResponse.json({
        success: true,
        affected: result.count,
      });
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (action === "delete") {
      // Check which contacts have linked donations or cases
      const contactsWithLinks = await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          _count: {
            select: {
              donations: true,
              cases: true,
            },
          },
        },
      });

      const blocked: string[] = [];
      const deletable: string[] = [];

      for (const c of contactsWithLinks) {
        if (c._count.donations > 0 || c._count.cases > 0) {
          const reasons: string[] = [];
          if (c._count.donations > 0) reasons.push(`${c._count.donations} donation(s)`);
          if (c._count.cases > 0) reasons.push(`${c._count.cases} case(s)`);
          blocked.push(`${c.firstName} ${c.lastName}: has ${reasons.join(" and ")}`);
        } else {
          deletable.push(c.id);
        }
      }

      if (blocked.length > 0 && deletable.length === 0) {
        return NextResponse.json({
          success: false,
          error: "None of the selected contacts can be deleted because they have linked records",
          details: blocked,
        });
      }

      if (blocked.length > 0) {
        // Partial: some can be deleted, some cannot
        // Only delete the ones without links
        await prisma.contact.deleteMany({
          where: { id: { in: deletable } },
        });

        return NextResponse.json({
          success: false,
          error: `${deletable.length} contact(s) deleted, but ${blocked.length} could not be deleted`,
          affected: deletable.length,
          details: blocked,
        });
      }

      // All safe to delete
      const result = await prisma.contact.deleteMany({
        where: { id: { in: contactIds } },
      });

      return NextResponse.json({
        success: true,
        affected: result.count,
      });
    }

    // ── EXPORT ──────────────────────────────────────────────────────
    if (action === "export") {
      const contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        include: {
          organisation: { select: { name: true } },
          tags: { include: { tag: { select: { name: true } } } },
          donations: { select: { amount: true } },
        },
        orderBy: { createdAt: "desc" },
      });

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
  } catch (error) {
    console.error("Bulk action error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
