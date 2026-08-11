import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";

interface ImportContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  dateOfBirth?: string;
  title?: string;
  types?: string[];
  notes?: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const contacts: ImportContact[] = body.contacts;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: "No contacts provided" },
        { status: 400 },
      );
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Collect all emails from the batch to check for duplicates in one query
    const emailsInBatch = contacts
      .map((c) => c.email?.trim().toLowerCase())
      .filter((e): e is string => !!e);

    const existingContacts =
      emailsInBatch.length > 0
        ? await prisma.contact.findMany({
            where: { email: { in: emailsInBatch, mode: "insensitive" } },
            select: { email: true },
          })
        : [];

    const existingEmails = new Set(
      existingContacts.map((c) => c.email?.toLowerCase()),
    );

    // Process each contact inside a transaction
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];

        // Validate required fields
        if (!c.firstName || !c.lastName) {
          errors.push(
            `Row ${i + 1}: Missing required field (firstName or lastName)`,
          );
          continue;
        }

        // Duplicate check by email
        const email = c.email?.trim().toLowerCase();
        if (email && existingEmails.has(email)) {
          skipped++;
          continue;
        }

        try {
          const contact = await tx.contact.create({
            data: {
              firstName: c.firstName.trim(),
              lastName: c.lastName.trim(),
              email: c.email?.trim() || null,
              phone: c.phone?.trim() || null,
              mobile: c.mobile?.trim() || null,
              addressLine1: c.addressLine1?.trim() || null,
              addressLine2: c.addressLine2?.trim() || null,
              city: c.city?.trim() || null,
              postcode: c.postcode?.trim() || null,
              country: c.country?.trim() || null,
              dateOfBirth: c.dateOfBirth?.trim() || null,
              title: c.title?.trim() || null,
              types: c.types ?? [],
              notes: c.notes?.trim() || null,
              createdById: session.id,
            },
          });

          // Track the email so later rows in the same batch don't duplicate
          if (email) {
            existingEmails.add(email);
          }

          imported++;

          // Audit log (fire-and-forget, don't let it break the import)
          try {
            await logAudit({
              userId: session.id,
              action: "CREATE",
              entityType: "Contact",
              entityId: contact.id,
              details: { source: "csv-import" },
            });
          } catch {
            // Audit logging should never block the import
          }

          // Auto-create volunteer profile if types include VOLUNTEER
          if (c.types?.includes("VOLUNTEER")) {
            try {
              await tx.volunteerProfile.create({
                data: { contactId: contact.id },
              });
            } catch {
              // Volunteer profile creation is best-effort
            }
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          errors.push(
            `Row ${i + 1} (${c.firstName} ${c.lastName}): ${message}`,
          );
        }
      }
    });

    return NextResponse.json({ imported, skipped, errors });
  } catch (err) {
    console.error("Contact import error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
