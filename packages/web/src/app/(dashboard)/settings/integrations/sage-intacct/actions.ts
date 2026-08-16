"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// ── Save Sage Settings ───────────────────────────────────────────

export async function saveSageSettings(formData: FormData) {
  const session = await requireRole(["ADMIN"]);

  const sageCompanyId = (formData.get("sageCompanyId") as string) || null;
  const sageSenderId = (formData.get("sageSenderId") as string) || null;
  const sageSenderPassword = (formData.get("sageSenderPassword") as string) || null;
  const sageUserId = (formData.get("sageUserId") as string) || null;
  const sageUserPassword = (formData.get("sageUserPassword") as string) || null;
  const sageEnabled = formData.get("sageEnabled") === "on";

  // TODO: Encrypt passwords before storing
  // In production, use a key management service (AWS KMS, HashiCorp Vault, etc)
  // or at minimum implement field-level encryption

  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {
      sageCompanyId,
      sageSenderId,
      sageSenderPassword,
      sageUserId,
      sageUserPassword,
      sageEnabled,
    },
    create: {
      id: "default",
      sageCompanyId,
      sageSenderId,
      sageSenderPassword,
      sageUserId,
      sageUserPassword,
      sageEnabled,
    },
  });

  redirect("/settings/integrations/sage-intacct");
}

// ── Test Connection ─────────────────────────────────────────────

export async function testSageConnection(formData: FormData) {
  const session = await requireRole(["ADMIN"]);

  const sageCompanyId = formData.get("sageCompanyId") as string;
  const sageSenderId = formData.get("sageSenderId") as string;
  const sageSenderPassword = formData.get("sageSenderPassword") as string;
  const sageUserId = formData.get("sageUserId") as string;
  const sageUserPassword = formData.get("sageUserPassword") as string;

  // TODO: Implement real connection test
  // 1. Call buildAuthXml() to create auth request
  // 2. POST to Sage API endpoint with credentials
  // 3. Parse XML response to check for success
  // 4. Return connection status

  try {
    console.log("TODO: testSageConnection", {
      companyId: sageCompanyId,
      senderId: sageSenderId,
    });

    // Placeholder: simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      success: true,
      message: "Connection test passed (placeholder)",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

// ── Account Mapping ─────────────────────────────────────────────

export async function addAccountMapping(formData: FormData) {
  const session = await requireRole(["ADMIN"]);

  const donationType = (formData.get("donationType") as string) || null;
  const ledgerCodeId = (formData.get("ledgerCodeId") as string) || null;
  const sageAccountNo = formData.get("sageAccountNo") as string;
  const sageAccountName = (formData.get("sageAccountName") as string) || null;
  const sageDepartment = (formData.get("sageDepartment") as string) || null;
  const sageLocation = (formData.get("sageLocation") as string) || null;
  const sageProject = (formData.get("sageProject") as string) || null;
  const direction = (formData.get("direction") as string) || "DEBIT";

  if (!sageAccountNo) {
    throw new Error("Sage GL Account Number is required");
  }

  await prisma.sageAccountMapping.create({
    data: {
      donationType,
      ledgerCodeId,
      sageAccountNo,
      sageAccountName,
      sageDepartment,
      sageLocation,
      sageProject,
      direction,
      isActive: true,
    },
  });

  redirect("/settings/integrations/sage-intacct/mappings");
}

export async function removeAccountMapping(formData: FormData) {
  const session = await requireRole(["ADMIN"]);

  const mappingId = formData.get("mappingId") as string;

  if (!mappingId) {
    throw new Error("Mapping ID is required");
  }

  await prisma.sageAccountMapping.delete({
    where: { id: mappingId },
  });

  redirect("/settings/integrations/sage-intacct/mappings");
}

// ── Sync Trigger ────────────────────────────────────────────────

export async function triggerSync(formData: FormData) {
  const session = await requireRole(["ADMIN"]);

  const syncType = (formData.get("syncType") as string) || "DONATION";

  // TODO: Implement full sync flow
  // 1. Get system settings with Sage credentials
  // 2. Query unsynced entities (donations, contacts, etc)
  // 3. Get account mappings
  // 4. For each entity:
  //    a. Create SageSyncLog entry with PENDING status
  //    b. Authenticate with getAPISession()
  //    c. Map entity data to Sage format
  //    d. Call createJournalEntry() / syncContact()
  //    e. Update SageSyncLog with SYNCED or ERROR status
  // 5. Log the sync initiation

  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
    });

    if (!settings?.sageEnabled || !settings?.sageCompanyId) {
      throw new Error("Sage Intacct is not configured");
    }

    if (syncType === "DONATION") {
      // Find unsynced donations
      const unsyncedDonations = await prisma.donation.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        include: {
          contact: true,
          ledgerCode: true,
          campaign: true,
        },
      });

      // Create pending sync logs for each
      await Promise.all(
        unsyncedDonations.map((donation) =>
          prisma.sageSyncLog.create({
            data: {
              entityType: "DONATION",
              entityId: donation.id,
              status: "PENDING",
              requestData: JSON.stringify({
                donationId: donation.id,
                amount: Number(donation.amount),
                currency: donation.currency,
                date: donation.date,
              }),
            },
          })
        )
      );

      // TODO: Call syncing logic
      // For each donation:
      // 1. Get account mapping based on donation type
      // 2. Map donation to journal entry
      // 3. Create journal entry in Sage
      // 4. Update sync log with recordKey and SYNCED status

      console.log(
        `Sync triggered: created pending sync entries (full implementation pending)`
      );
    }

    redirect("/settings/integrations/sage-intacct/sync");
  } catch (error) {
    console.error("Sync failed:", error);
    redirect("/settings/integrations/sage-intacct/sync");
  }
}

// ── Get Stats ───────────────────────────────────────────────────

export async function getSageStats() {
  const session = await requireRole(["ADMIN"]);

  const totalSynced = await prisma.sageSyncLog.count({
    where: { status: "SYNCED" },
  });

  const totalPending = await prisma.sageSyncLog.count({
    where: { status: "PENDING" },
  });

  const totalErrors = await prisma.sageSyncLog.count({
    where: { status: "ERROR" },
  });

  const lastSync = await prisma.sageSyncLog.findFirst({
    where: { status: "SYNCED" },
    orderBy: { syncedAt: "desc" },
  });

  return {
    totalSynced,
    totalPending,
    totalErrors,
    lastSyncTime: lastSync?.syncedAt,
  };
}
