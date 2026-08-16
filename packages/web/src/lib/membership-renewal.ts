import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

interface RenewalStats {
  upcomingCount: number;
  overdueCount: number;
  recentlyRenewedCount: number;
  totalRevenue: number;
}

/**
 * Process auto-renewals for memberships that are due or expiring soon
 * Finds memberships where autoRenew=true and endDate is past or within 7 days
 */
export async function processAutoRenewals(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;
  let failed = 0;

  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find memberships eligible for auto-renewal
    const membershipsToRenew = await prisma.membership.findMany({
      where: {
        autoRenew: true,
        status: "ACTIVE",
        endDate: {
          lte: sevenDaysFromNow,
        },
      },
      include: {
        contact: true,
        membershipType: true,
      },
    });

    for (const membership of membershipsToRenew) {
      try {
        await renewMembership(membership.id);
        processed++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to renew membership ${membership.id}: ${errorMsg}`);
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Error in processAutoRenewals: ${errorMsg}`);
  }

  return { processed, failed, errors };
}

/**
 * Get memberships renewing in the next N days
 */
export async function getUpcomingRenewals(days: number): Promise<
  Array<{
    id: string;
    memberNumber: string;
    contact: { id: string; firstName: string; lastName: string; email: string | null };
    membershipType: { id: string; name: string; price: number; duration: number };
    endDate: Date;
    autoRenew: boolean;
    daysUntilRenewal: number;
  }>
> {
  const now = new Date();
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const memberships = await prisma.membership.findMany({
    where: {
      status: "ACTIVE",
      autoRenew: true,
      endDate: {
        gte: now,
        lte: futureDate,
      },
    },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      membershipType: {
        select: {
          id: true,
          name: true,
          price: true,
          duration: true,
        },
      },
    },
    orderBy: { endDate: "asc" },
  });

  return memberships.map((m) => ({
    id: m.id,
    memberNumber: m.memberNumber,
    contact: m.contact,
    membershipType: m.membershipType,
    endDate: m.endDate,
    autoRenew: m.autoRenew,
    daysUntilRenewal: Math.ceil(
      (m.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}

/**
 * Get expired/lapsed memberships past grace period
 */
export async function getExpiredMemberships(): Promise<
  Array<{
    id: string;
    memberNumber: string;
    contact: { id: string; firstName: string; lastName: string; email: string | null };
    membershipType: { id: string; name: string; renewalGraceDays: number };
    endDate: Date;
    status: string;
    daysSinceExpiry: number;
  }>
> {
  const memberships = await prisma.membership.findMany({
    where: {
      status: {
        in: ["EXPIRED", "LAPSED"],
      },
    },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      membershipType: {
        select: {
          id: true,
          name: true,
          renewalGraceDays: true,
        },
      },
    },
    orderBy: { endDate: "asc" },
  });

  const now = new Date();

  return memberships.map((m) => ({
    id: m.id,
    memberNumber: m.memberNumber,
    contact: m.contact,
    membershipType: m.membershipType,
    endDate: m.endDate,
    status: m.status,
    daysSinceExpiry: Math.ceil(
      (now.getTime() - m.endDate.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}

/**
 * Manually renew a single membership
 */
export async function renewMembership(membershipId: string): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      contact: true,
      membershipType: true,
    },
  });

  if (!membership) {
    throw new Error(`Membership ${membershipId} not found`);
  }

  if (!membership.autoRenew && membership.status === "ACTIVE") {
    throw new Error(
      `Membership ${membershipId} does not have auto-renewal enabled`
    );
  }

  const now = new Date();

  // Calculate new end date
  const newEndDate = new Date(membership.endDate);
  newEndDate.setMonth(newEndDate.getMonth() + membership.membershipType.duration);

  // Create renewal record
  const renewal = await prisma.membershipRenewal.create({
    data: {
      membershipId,
      fromDate: membership.endDate,
      toDate: newEndDate,
      amount: membership.membershipType.price,
      paymentMethod: membership.paymentMethod || "automatic",
      paymentReference: `AUTO-${membershipId}-${now.getTime()}`,
    },
  });

  // Update membership
  await prisma.membership.update({
    where: { id: membershipId },
    data: {
      endDate: newEndDate,
      lastRenewalDate: now,
      renewalDate: newEndDate,
      status: "ACTIVE",
    },
  });

  // Send renewal email notification
  if (membership.contact.email) {
    const emailHtml = buildRenewalEmailHtml({
      contactName: `${membership.contact.firstName} ${membership.contact.lastName}`,
      membershipType: membership.membershipType.name,
      memberNumber: membership.memberNumber,
      renewalDate: now.toLocaleDateString(),
      newExpiryDate: newEndDate.toLocaleDateString(),
      amount: Number(membership.membershipType.price),
      currency: membership.membershipType.currency,
    });

    await sendEmail({
      to: membership.contact.email,
      subject: `Your Membership Has Been Renewed - ${membership.membershipType.name}`,
      html: emailHtml,
      text: `Your membership has been automatically renewed.`,
    });
  }
}

/**
 * Get renewal statistics
 */
export async function getRenewalStats(): Promise<RenewalStats> {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [upcomingCount, overdueCount, recentlyRenewalRecords, membershipTypes] =
    await Promise.all([
      prisma.membership.count({
        where: {
          status: "ACTIVE",
          autoRenew: true,
          endDate: {
            gte: now,
            lte: sevenDaysFromNow,
          },
        },
      }),
      prisma.membership.count({
        where: {
          status: {
            in: ["EXPIRED", "LAPSED"],
          },
        },
      }),
      prisma.membershipRenewal.findMany({
        where: {
          renewedAt: {
            gte: thirtyDaysAgo,
            lte: now,
          },
        },
      }),
      prisma.membershipType.findMany({
        where: { isActive: true },
      }),
    ]);

  const totalRevenue = membershipTypes.reduce((sum, type) => sum + Number(type.price), 0);

  return {
    upcomingCount,
    overdueCount,
    recentlyRenewedCount: recentlyRenewalRecords.length,
    totalRevenue,
  };
}

/**
 * Build HTML email for renewal notification
 */
function buildRenewalEmailHtml(data: {
  contactName: string;
  membershipType: string;
  memberNumber: string;
  renewalDate: string;
  newExpiryDate: string;
  amount: number;
  currency: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #10b981; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">
                ✓ Membership Renewed
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">
                Your membership is now active
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 24px; color: #374151; font-size: 15px; line-height: 1.6;">
                Hello ${data.contactName},
              </p>
              <p style="margin: 0 0 24px; color: #374151; font-size: 15px; line-height: 1.6;">
                Thank you for your continued support. Your ${data.membershipType} membership has been automatically renewed.
              </p>

              <!-- Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 8px 16px;">
                    <p style="margin: 0; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Member Number</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 15px; font-weight: 500;">${data.memberNumber}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 16px;">
                    <p style="margin: 0; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Membership Type</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 15px; font-weight: 500;">${data.membershipType}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 16px;">
                    <p style="margin: 0; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Renewed Date</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 15px; font-weight: 500;">${data.renewalDate}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 16px;">
                    <p style="margin: 0; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">New Expiry Date</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 15px; font-weight: 500;">${data.newExpiryDate}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 16px;">
                    <p style="margin: 0; color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Amount</p>
                    <p style="margin: 4px 0 0; color: #111827; font-size: 15px; font-weight: 500;">${data.currency} ${data.amount.toFixed(2)}</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; color: #6B7280; font-size: 13px; text-align: center;">
                Thank you for your support.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9CA3AF; font-size: 12px; text-align: center;">
                If you have any questions about your membership, please contact us.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
