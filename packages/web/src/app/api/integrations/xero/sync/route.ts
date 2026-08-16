import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  syncContactToXero,
  fetchXeroContactByEmail,
  createXeroInvoiceFromDonation,
  createXeroPaymentForInvoice,
  refreshAccessToken,
} from "@/lib/xero";

/**
 * POST: Trigger sync of donations and contacts to Xero
 * Body: { type: "DONATIONS" | "CONTACTS", startDate?: string, endDate?: string }
 */

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const { type, startDate, endDate } = body;

  if (!["DONATIONS", "CONTACTS"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid sync type" },
      { status: 400 }
    );
  }

  try {
    const config = await prisma.xeroConfig.findUnique({
      where: { id: "default" },
    });

    if (!config?.isConnected || !config.accessToken || !config.tenantId) {
      return NextResponse.json(
        { error: "Xero not connected" },
        { status: 400 }
      );
    }

    let accessToken = config.accessToken;

    // Check if token needs refresh
    if (config.tokenExpiresAt && config.tokenExpiresAt < new Date()) {
      if (!config.clientId || !config.clientSecret || !config.refreshToken) {
        return NextResponse.json(
          { error: "Cannot refresh token - credentials missing" },
          { status: 400 }
        );
      }

      try {
        const tokens = await refreshAccessToken(
          {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/integrations/xero/callback`,
          },
          config.refreshToken
        );

        await prisma.xeroConfig.update({
          where: { id: "default" },
          data: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: tokens.expiresAt,
          },
        });

        accessToken = tokens.accessToken;
      } catch (error) {
        console.error("Failed to refresh token:", error);
        return NextResponse.json(
          { error: "Token refresh failed" },
          { status: 401 }
        );
      }
    }

    let syncedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    if (type === "CONTACTS") {
      // Sync all active contacts
      const contacts = await prisma.contact.findMany({
        where: { isArchived: false },
        take: 100, // Limit to prevent timeout
      });

      for (const contact of contacts) {
        try {
          // Check if contact exists in Xero by email
          let xeroContactId = null;
          if (contact.email) {
            const existingContact = await fetchXeroContactByEmail(
              accessToken,
              config.tenantId,
              contact.email
            );
            xeroContactId = existingContact?.ContactID || null;
          }

          // Sync contact
          if (!xeroContactId) {
            const fullName = `${contact.firstName} ${contact.lastName}`.trim();
            xeroContactId = await syncContactToXero(accessToken, config.tenantId, {
              contactId: contact.id,
              name: fullName || "Unnamed Contact",
              email: contact.email || undefined,
              phone: contact.phone || undefined,
              address: contact.addressLine1 || undefined,
              city: contact.city || undefined,
              postcode: contact.postcode || undefined,
              country: contact.country || undefined,
            });
          }

          if (xeroContactId) {
            // Log successful sync
            await prisma.xeroSyncLog.create({
              data: {
                entityType: "CONTACT",
                entityId: contact.id,
                xeroId: xeroContactId,
                direction: "PUSH",
                status: "SUCCESS",
              },
            });
            syncedCount++;
          }
        } catch (error) {
          failedCount++;
          const msg = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Contact ${contact.id}: ${msg}`);

          // Log failed sync
          await prisma.xeroSyncLog.create({
            data: {
              entityType: "CONTACT",
              entityId: contact.id,
              direction: "PUSH",
              status: "FAILED",
              detail: msg,
            },
          });
        }
      }
    } else if (type === "DONATIONS") {
      // Sync donations with date range
      const where: any = { isArchived: false };

      if (startDate) {
        where.date = { gte: new Date(startDate) };
      }
      if (endDate) {
        where.date = where.date
          ? { ...where.date, lte: new Date(endDate) }
          : { lte: new Date(endDate) };
      }

      const donations = await prisma.donation.findMany({
        where,
        include: {
          contact: true,
          ledgerCode: true,
        },
        take: 100, // Limit to prevent timeout
      });

      // Get account mappings
      const mappings = await prisma.xeroAccountMapping.findMany();
      const mappingsByLedgerId = new Map(
        mappings.map((m) => [m.ledgerCodeId, m.xeroAccountCode])
      );

      for (const donation of donations) {
        try {
          // Get or create contact in Xero
          let xeroContactId = null;
          if (donation.contact.email) {
            const existingContact = await fetchXeroContactByEmail(
              accessToken,
              config.tenantId,
              donation.contact.email
            );
            xeroContactId = existingContact?.ContactID || null;
          }

          if (!xeroContactId) {
            const fullName = `${donation.contact.firstName} ${donation.contact.lastName}`.trim();
            xeroContactId = await syncContactToXero(
              accessToken,
              config.tenantId,
              {
                contactId: donation.contact.id,
                name: fullName || "Unnamed Contact",
                email: donation.contact.email || undefined,
                phone: donation.contact.phone || undefined,
              }
            );
          }

          if (!xeroContactId) {
            throw new Error("Could not create contact in Xero");
          }

          // Get account code for this donation
          const accountCode =
            mappingsByLedgerId.get(donation.ledgerCodeId || "") ||
            config.defaultRevenueAccountCode ||
            "200";

          // Create invoice
          const donorFullName = `${donation.contact.firstName} ${donation.contact.lastName}`.trim();
          const invoiceId = await createXeroInvoiceFromDonation(
            accessToken,
            config.tenantId,
            {
              donationId: donation.id,
              contactId: donation.contact.id,
              amount: Number(donation.amount),
              currency: donation.currency,
              date: donation.date,
              donorName: donorFullName || "Unnamed Donor",
              donorEmail: donation.contact.email ?? undefined,
              donationType: donation.type,
              xeroAccountCode: accountCode,
              reference: donation.reference || undefined,
            },
            xeroContactId
          );

          if (invoiceId) {
            // Create payment for the invoice
            await createXeroPaymentForInvoice(
              accessToken,
              config.tenantId,
              invoiceId,
              Number(donation.amount),
              donation.date,
              config.defaultBankAccountCode || "200"
            );

            // Log successful sync
            await prisma.xeroSyncLog.create({
              data: {
                entityType: "DONATION",
                entityId: donation.id,
                xeroId: invoiceId,
                direction: "PUSH",
                status: "SUCCESS",
              },
            });
            syncedCount++;
          }
        } catch (error) {
          failedCount++;
          const msg = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Donation ${donation.id}: ${msg}`);

          // Log failed sync
          await prisma.xeroSyncLog.create({
            data: {
              entityType: "DONATION",
              entityId: donation.id,
              direction: "PUSH",
              status: "FAILED",
              detail: msg,
            },
          });
        }
      }
    }

    // Update last sync time
    await prisma.xeroConfig.update({
      where: { id: "default" },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      synced: true,
      type,
      syncedCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
