"use server";

import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { calculateGiftAid, isValidUKPostcode, buildGovTalkXml } from "@/lib/hmrc";
import { sendEmail, APP_URL } from "@/lib/email";
import {
  buildRetailGiftAidEmailHtml,
  type RetailGiftAidLetterData,
} from "@/lib/retail-gift-aid-letter";
import { formatCurrency, formatDate } from "@/lib/utils";

// Donation types NOT eligible for Gift Aid
const NON_ELIGIBLE_TYPES = ["IN_KIND", "GRANT", "LEGACY"];

/**
 * Create a new Gift Aid claim with eligible donations.
 * Eligibility: contact has an active declaration of the claim type,
 * donation is received, not already claimed, and is an eligible type.
 */
export async function createClaim(formData: FormData) {
  const session = await requireAuth();

  const reference = (formData.get("reference") as string) || "";
  const periodStartStr = formData.get("periodStart") as string;
  const periodEndStr = formData.get("periodEnd") as string;
  const claimType = (formData.get("claimType") as string) || "STANDARD";
  const excludedIdsJson = formData.get("excludedIds") as string;
  const isTestMode = formData.get("isTestMode") === "true";

  if (!periodStartStr || !periodEndStr) {
    redirect(`/finance/gift-aid/claims/new?type=${claimType}&error=missing-dates`);
  }

  const periodStart = new Date(periodStartStr);
  const periodEnd = new Date(periodEndStr + "T23:59:59.999Z");
  const excludedIds: string[] = excludedIdsJson ? JSON.parse(excludedIdsJson) : [];

  // Find contacts with active declarations of this type
  const activeDeclarations = await prisma.giftAid.findMany({
    where: {
      status: "ACTIVE",
      type: claimType,
      startDate: { lte: periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
    },
    select: { contactId: true },
  });

  const eligibleContactIds = [...new Set(activeDeclarations.map((d) => d.contactId))];

  // Find all unclaimed donations from these contacts
  // For RETAIL claims, only include donations marked as retail (from charity shop EPOS)
  const donationFilter: Record<string, unknown> = {
    contactId: { in: eligibleContactIds },
    giftAidClaimed: false,
    status: "RECEIVED",
    type: { notIn: NON_ELIGIBLE_TYPES },
    date: { gte: periodStart, lte: periodEnd },
  };
  if (claimType === "RETAIL") {
    donationFilter.isRetail = true;
  } else {
    // Standard claims should exclude retail donations
    donationFilter.isRetail = false;
  }

  const eligibleDonations =
    eligibleContactIds.length > 0
      ? await prisma.donation.findMany({
          where: donationFilter,
          include: {
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                postcode: true,
                addressLine1: true,
                city: true,
              },
            },
          },
        })
      : [];

  if (eligibleDonations.length === 0) {
    redirect(`/finance/gift-aid/claims/new?type=${claimType}&error=no-eligible-donations`);
  }

  // Calculate totals only for included items
  let totalDonations = 0;
  let totalClaimable = 0;
  let includedCount = 0;

  const items = eligibleDonations.map((donation) => {
    const isExcluded = excludedIds.includes(donation.id);
    const giftAid = calculateGiftAid(Number(donation.amount));
    const hasValidPostcode = donation.contact.postcode
      ? isValidUKPostcode(donation.contact.postcode)
      : false;

    let status: "INCLUDED" | "EXCLUDED" | "ERROR" = "INCLUDED";
    let errorReason: string | null = null;

    if (isExcluded) {
      status = "EXCLUDED";
    } else if (!hasValidPostcode) {
      status = "ERROR";
      errorReason = donation.contact.postcode
        ? "Invalid UK postcode format"
        : "Missing postcode";
    }

    if (status === "INCLUDED") {
      totalDonations += Number(donation.amount);
      totalClaimable += giftAid;
      includedCount++;
    }

    const donorAddress = [
      donation.contact.addressLine1,
      donation.contact.city,
      donation.contact.postcode,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      donationId: donation.id,
      contactId: donation.contactId,
      donorName: `${donation.contact.firstName || ""} ${donation.contact.lastName || ""}`.trim(),
      donorAddress: donorAddress || null,
      donorPostcode: donation.contact.postcode,
      donationDate: donation.date,
      donationAmount: donation.amount,
      giftAidAmount: giftAid,
      status,
      errorReason,
    };
  });

  // Create claim with items — use claimType column AND notes for backward compat
  const claim = await prisma.giftAidClaim.create({
    data: {
      claimReference: reference,
      claimType,
      periodStart,
      periodEnd,
      status: "DRAFT",
      totalDonations,
      totalClaimable,
      donationCount: includedCount,
      isTestMode,
      notes: claimType, // backward compat
      createdById: session.id,
      items: {
        createMany: { data: items },
      },
    },
  });

  // Mark included donations as claimed
  const includedDonationIds = items
    .filter((i) => i.status === "INCLUDED")
    .map((i) => i.donationId);

  if (includedDonationIds.length > 0) {
    await prisma.donation.updateMany({
      where: { id: { in: includedDonationIds } },
      data: { giftAidClaimed: true },
    });
  }

  await logAudit({
    userId: session.id,
    action: "CREATE",
    entityType: "GiftAidClaim",
    entityId: claim.id,
    details: {
      reference: claim.claimReference,
      claimType,
      donationCount: includedCount,
      excludedCount: excludedIds.length,
      totalClaimable: claim.totalClaimable,
      isTestMode,
    },
  });

  revalidatePath("/finance/gift-aid/claims");
  redirect(`/finance/gift-aid/claims/${claim.id}`);
}

/**
 * Toggle a claim item between INCLUDED and EXCLUDED (only for DRAFT/NOTIFICATIONS_SENT claims)
 */
export async function toggleClaimItem(formData: FormData) {
  const session = await requireAuth();
  const itemId = formData.get("itemId") as string;
  const claimId = formData.get("claimId") as string;

  const item = await prisma.giftAidClaimItem.findUnique({
    where: { id: itemId },
    include: { claim: true },
  });

  if (!item || !["DRAFT", "NOTIFICATIONS_SENT"].includes(item.claim.status)) return;

  const newStatus = item.status === "INCLUDED" ? "EXCLUDED" : "INCLUDED";

  await prisma.giftAidClaimItem.update({
    where: { id: itemId },
    data: { status: newStatus },
  });

  // Update donation claimed flag
  if (newStatus === "EXCLUDED") {
    await prisma.donation.update({
      where: { id: item.donationId },
      data: { giftAidClaimed: false },
    });
  } else {
    await prisma.donation.update({
      where: { id: item.donationId },
      data: { giftAidClaimed: true },
    });
  }

  // Recalculate claim totals
  const allItems = await prisma.giftAidClaimItem.findMany({
    where: { claimId },
  });

  const includedItems = allItems.filter((i) => i.status === "INCLUDED");
  const totalDonations = includedItems.reduce((sum, i) => sum + Number(i.donationAmount), 0);
  const totalClaimable = includedItems.reduce((sum, i) => sum + Number(i.giftAidAmount), 0);

  await prisma.giftAidClaim.update({
    where: { id: claimId },
    data: {
      totalDonations,
      totalClaimable,
      donationCount: includedItems.length,
    },
  });

  await logAudit({
    userId: session.id,
    action: "UPDATE",
    entityType: "GiftAidClaimItem",
    entityId: itemId,
    details: { newStatus, claimId },
  });

  revalidatePath(`/finance/gift-aid/claims/${claimId}`);
}

/**
 * Send retail gift aid notifications to all donors in the claim.
 * Emails those with email addresses, creates postal notification records for others.
 * Sets 28-day deadline before claim can be submitted.
 */
export async function sendRetailNotifications(formData: FormData) {
  const session = await requireAuth();
  const claimId = formData.get("claimId") as string;

  try {
    const claim = await prisma.giftAidClaim.findUnique({
      where: { id: claimId },
      include: {
        items: {
          where: { status: "INCLUDED" },
          select: { contactId: true, donationAmount: true, giftAidAmount: true },
        },
      },
    });

    if (!claim || claim.status !== "DRAFT" || (claim.claimType || claim.notes) !== "RETAIL") return;

    // Get unique contacts with their details
    const contactIds = [...new Set(claim.items.map((i) => i.contactId))];
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        postcode: true,
        consentEmail: true,
      },
    });

    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: {
        orgName: true,
        headOfficeAddress: true,
      },
    });

    const charityName = settings?.orgName || "Our Charity";
    const charityNumber = "";
    const charityAddress = settings?.headOfficeAddress || "";
    const charityPhone = ""; // TODO: add phone field to SystemSettings

    const now = new Date();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 28);

    const taxYearStart = formatDate(claim.periodStart);
    const taxYearEnd = formatDate(claim.periodEnd);
    const deadlineStr = formatDate(deadline);

    let emailsSent = 0;
    let postalNeeded = 0;

    for (const contact of contacts) {
      const contactName = `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
      const contactAddress = [
        contact.addressLine1,
        contact.addressLine2,
        contact.city,
        contact.postcode,
      ]
        .filter(Boolean)
        .join(", ");

      // Calculate this contact's totals
      const contactItems = claim.items.filter((i) => i.contactId === contact.id);
      const totalProceeds = contactItems.reduce((s, i) => s + Number(i.donationAmount), 0);
      const giftAidAmount = contactItems.reduce((s, i) => s + Number(i.giftAidAmount), 0);

      const hasEmail = !!contact.email;
      const method = hasEmail ? "EMAIL" : "POST";

      // Create notification record with unique token
      const notification = await prisma.retailGiftAidNotification.create({
        data: {
          claimId: claim.id,
          contactId: contact.id,
          contactName,
          contactEmail: contact.email,
          method,
          status: "PENDING",
        },
      });

      const letterData: RetailGiftAidLetterData = {
        contactName,
        contactAddress,
        charityName,
        charityAddress,
        charityNumber,
        charityPhone,
        claimReference: claim.claimReference,
        taxYearStart,
        taxYearEnd,
        totalProceeds: formatCurrency(totalProceeds),
        giftAidClaimed: formatCurrency(giftAidAmount),
        donationCount: contactItems.length,
        optOutToken: notification.token,
        emailConsentToken: notification.token,
        notificationDeadline: deadlineStr,
        hasEmail,
      };

      if (hasEmail && contact.email) {
        // Send HTML email
        try {
          const html = buildRetailGiftAidEmailHtml(letterData);
          const sent = await sendEmail({
            to: contact.email,
            subject: `Retail Gift Aid Notification — ${charityName} (${claim.claimReference})`,
            html,
          });

          await prisma.retailGiftAidNotification.update({
            where: { id: notification.id },
            data: {
              status: sent ? "SENT" : "FAILED",
              sentAt: sent ? new Date() : undefined,
            },
          });

          if (sent) emailsSent++;
        } catch {
          await prisma.retailGiftAidNotification.update({
            where: { id: notification.id },
            data: { status: "FAILED" },
          });
        }
      } else {
        // Mark as POST — PDF will be generated separately
        postalNeeded++;
      }
    }

    // Update claim status and set deadline
    await prisma.giftAidClaim.update({
      where: { id: claimId },
      data: {
        status: "NOTIFICATIONS_SENT",
        notificationsSentAt: now,
        notificationDeadline: deadline,
        notificationsSentById: session.id,
      },
    });

    await logAudit({
      userId: session.id,
      action: "UPDATE",
      entityType: "GiftAidClaim",
      entityId: claimId,
      details: {
        action: "send_retail_notifications",
        emailsSent,
        postalNeeded,
        totalContacts: contacts.length,
        deadline: deadline.toISOString(),
      },
    });

    revalidatePath(`/finance/gift-aid/claims/${claimId}`);
  } catch (error) {
    console.error("sendRetailNotifications error:", error);
    redirect(`/finance/gift-aid/claims/${claimId}?error=notification-failed&msg=${encodeURIComponent(String(error))}`);
  }

  redirect(`/finance/gift-aid/claims/${claimId}`);
}

/**
 * Mark claim as ready for submission.
 * For RETAIL claims: enforces 28-day notification deadline.
 */
export async function markClaimReady(formData: FormData) {
  const session = await requireAuth();
  const claimId = formData.get("claimId") as string;

  const claim = await prisma.giftAidClaim.findUnique({
    where: { id: claimId },
    include: { items: true },
  });

  if (!claim) return;

  // Standard claims: DRAFT → READY
  // Retail claims: NOTIFICATIONS_SENT → READY (with 28-day check)
  if ((claim.claimType || claim.notes) === "RETAIL") {
    if (claim.status !== "NOTIFICATIONS_SENT") return;

    // Hard block: 28 days must have passed
    if (claim.notificationDeadline && new Date() < new Date(claim.notificationDeadline)) {
      redirect(
        `/finance/gift-aid/claims/${claimId}?error=deadline-not-passed`
      );
    }
  } else {
    if (claim.status !== "DRAFT") return;
  }

  // Check for error items that are still included
  const errorItems = claim.items.filter((item) => item.status === "ERROR");
  if (errorItems.length > 0) {
    redirect(`/finance/gift-aid/claims/${claimId}?error=items-have-errors`);
  }

  const includedItems = claim.items.filter((item) => item.status === "INCLUDED");
  if (includedItems.length === 0) {
    redirect(`/finance/gift-aid/claims/${claimId}?error=no-included-items`);
  }

  await prisma.giftAidClaim.update({
    where: { id: claimId },
    data: { status: "READY" },
  });

  await logAudit({
    userId: session.id,
    action: "UPDATE",
    entityType: "GiftAidClaim",
    entityId: claimId,
    details: { newStatus: "READY" },
  });

  revalidatePath(`/finance/gift-aid/claims/${claimId}`);
  redirect(`/finance/gift-aid/claims/${claimId}`);
}

/**
 * Submit claim to HMRC (or simulate if test mode)
 */
export async function submitToHmrc(formData: FormData) {
  const session = await requireAuth();
  const claimId = formData.get("claimId") as string;

  const claim = await prisma.giftAidClaim.findUnique({
    where: { id: claimId },
    include: {
      items: { where: { status: "INCLUDED" } },
    },
  });

  if (!claim || claim.status !== "READY") return;

  // Build submission XML for audit trail
  const submissionXml = buildGovTalkXml({
    charityRef: "CHARITY-REF", // TODO: pull from system settings
    gatewayUser: "GATEWAY-USER",
    submissionId: claim.claimReference,
    claimReference: claim.claimReference,
    periodStart: claim.periodStart,
    periodEnd: claim.periodEnd,
    donations: claim.items.map((item) => ({
      donorName: item.donorName,
      donorPostcode: item.donorPostcode || "",
      donationAmount: item.donationAmount,
      donationDate: item.donationDate,
      giftAidAmount: item.giftAidAmount,
    })),
    totalDonations: claim.totalDonations,
    totalGiftAid: claim.totalClaimable,
    gasdsAmount: claim.gasdsAmount || undefined,
  });

  if (claim.isTestMode) {
    // Test mode: simulate a successful submission
    const testCorrelationId = `TEST-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const testHmrcRef = `HMRC-TEST-${claim.claimReference}`;

    await prisma.giftAidClaim.update({
      where: { id: claimId },
      data: {
        status: "ACCEPTED",
        submittedAt: new Date(),
        submittedById: session.id,
        correlationId: testCorrelationId,
        hmrcReference: testHmrcRef,
        hmrcResponse: "TEST MODE: Simulated acceptance",
        submissionXml,
        responseXml: `<TestResponse><Status>ACCEPTED</Status><Reference>${testHmrcRef}</Reference><Message>Test submission accepted</Message></TestResponse>`,
        acceptedAt: new Date(),
        amountReceived: claim.totalClaimable,
        receivedAt: new Date(),
      },
    });

    await logAudit({
      userId: session.id,
      action: "UPDATE",
      entityType: "GiftAidClaim",
      entityId: claimId,
      details: {
        newStatus: "ACCEPTED",
        correlationId: testCorrelationId,
        hmrcReference: testHmrcRef,
        isTestMode: true,
        note: "Test mode — simulated HMRC acceptance",
      },
    });
  } else {
    const correlationId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    await prisma.giftAidClaim.update({
      where: { id: claimId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedById: session.id,
        correlationId,
        submissionXml,
      },
    });

    await logAudit({
      userId: session.id,
      action: "UPDATE",
      entityType: "GiftAidClaim",
      entityId: claimId,
      details: {
        newStatus: "SUBMITTED",
        correlationId,
        note: "Submitted to HMRC",
      },
    });
  }

  revalidatePath(`/finance/gift-aid/claims/${claimId}`);
  redirect(`/finance/gift-aid/claims/${claimId}`);
}

/**
 * Check HMRC submission status via polling
 */
export async function checkHmrcStatus(formData: FormData) {
  const session = await requireAuth();
  const claimId = formData.get("claimId") as string;

  const claim = await prisma.giftAidClaim.findUnique({
    where: { id: claimId },
  });

  if (!claim || claim.status !== "SUBMITTED") return;

  await logAudit({
    userId: session.id,
    action: "UPDATE",
    entityType: "GiftAidClaim",
    entityId: claimId,
    details: {
      action: "check_status",
      correlationId: claim.correlationId,
      note: "Status check requested — awaiting real HMRC integration",
    },
  });

  revalidatePath(`/finance/gift-aid/claims/${claimId}`);
  redirect(`/finance/gift-aid/claims/${claimId}?status=checked`);
}

/**
 * Reset claim from REJECTED back to DRAFT
 */
export async function resetClaim(formData: FormData) {
  const session = await requireAuth();
  const claimId = formData.get("claimId") as string;

  const claim = await prisma.giftAidClaim.findUnique({
    where: { id: claimId },
  });

  if (!claim || claim.status !== "REJECTED") return;

  await prisma.giftAidClaim.update({
    where: { id: claimId },
    data: {
      status: "DRAFT",
      submittedAt: null,
      correlationId: null,
      rejectionReason: null,
    },
  });

  await logAudit({
    userId: session.id,
    action: "UPDATE",
    entityType: "GiftAidClaim",
    entityId: claimId,
    details: { resetFrom: "REJECTED", newStatus: "DRAFT" },
  });

  revalidatePath(`/finance/gift-aid/claims/${claimId}`);
  redirect(`/finance/gift-aid/claims/${claimId}`);
}

/**
 * Delete a claim (only if DRAFT). Un-claims the donations.
 */
export async function deleteClaim(formData: FormData) {
  const session = await requireAuth();
  const claimId = formData.get("claimId") as string;

  const claim = await prisma.giftAidClaim.findUnique({
    where: { id: claimId },
    include: { items: true },
  });

  if (!claim || claim.status !== "DRAFT") return;

  // Un-claim included donations
  const includedDonationIds = claim.items
    .filter((i) => i.status === "INCLUDED")
    .map((i) => i.donationId);

  if (includedDonationIds.length > 0) {
    await prisma.donation.updateMany({
      where: { id: { in: includedDonationIds } },
      data: { giftAidClaimed: false },
    });
  }

  const reference = claim.claimReference;

  await prisma.giftAidClaimItem.deleteMany({ where: { claimId } });
  await prisma.giftAidClaim.delete({ where: { id: claimId } });

  await logAudit({
    userId: session.id,
    action: "DELETE",
    entityType: "GiftAidClaim",
    entityId: claimId,
    details: { reference, unclaimedDonations: includedDonationIds.length },
  });

  revalidatePath("/finance/gift-aid/claims");
  redirect("/finance/gift-aid/claims");
}
