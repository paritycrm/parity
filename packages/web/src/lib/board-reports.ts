import { prisma } from "@/lib/prisma";

export interface ReportData {
  summary: Record<string, unknown>;
  sections: ReportSection[];
  generatedAt: string;
}

export interface ReportSection {
  title: string;
  data: Record<string, unknown>;
}

export async function generateQuarterlySummary(
  startDate: Date,
  endDate: Date
): Promise<ReportData> {
  const [donations, grants, memberships, events, contacts, campaigns] =
    await Promise.all([
      // Donation totals
      prisma.donation.aggregate({
        where: {
          date: { gte: startDate, lte: endDate },
          status: { in: ["RECEIVED", "PENDING"] },
        },
        _sum: { amount: true },
        _count: true,
      }),
      // Grant totals
      prisma.grant.aggregate({
        where: {
          startDate: { gte: startDate, lte: endDate },
          status: "SUCCESSFUL",
        },
        _sum: { amountAwarded: true },
        _count: true,
      }),
      // Membership stats
      prisma.membership.groupBy({
        by: ["status"],
        _count: true,
        where: {
          OR: [
            { startDate: { gte: startDate, lte: endDate } },
            { status: "ACTIVE" },
          ],
        },
      }),
      // Events
      prisma.event.findMany({
        where: {
          startDate: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          name: true,
          status: true,
          _count: { select: { attendees: true } },
        },
      }),
      // New contacts
      prisma.contact.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      // Campaign performance
      prisma.campaign.findMany({
        where: {
          OR: [
            { startDate: { gte: startDate, lte: endDate } },
            { status: "ACTIVE" },
          ],
        },
        select: {
          id: true,
          name: true,
          status: true,
          budgetTarget: true,
          _count: { select: { donations: true } },
        },
      }),
    ]);

  // Donation breakdown by type
  const donationsByType = await prisma.donation.groupBy({
    by: ["type"],
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ["RECEIVED", "PENDING"] },
    },
    _sum: { amount: true },
    _count: true,
  });

  // Donation breakdown by method
  const donationsByMethod = await prisma.donation.groupBy({
    by: ["method"],
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ["RECEIVED", "PENDING"] },
    },
    _sum: { amount: true },
    _count: true,
  });

  const membershipStats: Record<string, number> = {};
  memberships.forEach((m) => {
    membershipStats[m.status] = m._count;
  });

  const totalIncome =
    Number(donations._sum.amount ?? 0) + Number(grants._sum.amountAwarded ?? 0);

  return {
    summary: {
      totalIncome,
      totalDonations: Number(donations._sum.amount ?? 0),
      donationCount: donations._count,
      totalGrants: Number(grants._sum.amountAwarded ?? 0),
      grantCount: grants._count,
      newContacts: contacts,
      totalEvents: events.length,
      totalAttendees: events.reduce(
        (sum, e) => sum + e._count.attendees,
        0
      ),
    },
    sections: [
      {
        title: "Income Overview",
        data: {
          totalIncome,
          donationIncome: Number(donations._sum.amount ?? 0),
          grantIncome: Number(grants._sum.amountAwarded ?? 0),
          donationsByType: donationsByType.map((d) => ({
            type: d.type,
            total: Number(d._sum.amount ?? 0),
            count: d._count,
          })),
          donationsByMethod: donationsByMethod.map((d) => ({
            method: d.method ?? "Unknown",
            total: Number(d._sum.amount ?? 0),
            count: d._count,
          })),
        },
      },
      {
        title: "Membership Summary",
        data: {
          statusBreakdown: membershipStats,
          totalActive: membershipStats["ACTIVE"] ?? 0,
          totalExpired: membershipStats["EXPIRED"] ?? 0,
          totalLapsed: membershipStats["LAPSED"] ?? 0,
        },
      },
      {
        title: "Events & Engagement",
        data: {
          totalEvents: events.length,
          eventList: events.map((e) => ({
            name: e.name,
            status: e.status,
            attendees: e._count.attendees,
          })),
          totalAttendees: events.reduce(
            (sum, e) => sum + e._count.attendees,
            0
          ),
        },
      },
      {
        title: "Campaign Performance",
        data: {
          activeCampaigns: campaigns.length,
          campaigns: campaigns.map((c) => ({
            name: c.name,
            status: c.status,
            target: c.budgetTarget,
            donationCount: c._count.donations,
          })),
        },
      },
      {
        title: "Supporter Growth",
        data: {
          newContacts: contacts,
        },
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateFundraisingUpdate(
  startDate: Date,
  endDate: Date
): Promise<ReportData> {
  const [donations, topDonors, campaigns, grants] = await Promise.all([
    prisma.donation.aggregate({
      where: {
        date: { gte: startDate, lte: endDate },
        status: { in: ["RECEIVED", "PENDING"] },
      },
      _sum: { amount: true },
      _count: true,
      _avg: { amount: true },
    }),
    prisma.donation.groupBy({
      by: ["contactId"],
      where: {
        date: { gte: startDate, lte: endDate },
        status: { in: ["RECEIVED", "PENDING"] },
      },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    }),
    prisma.campaign.findMany({
      where: {
        OR: [
          { startDate: { gte: startDate, lte: endDate } },
          { status: "ACTIVE" },
        ],
      },
      include: {
        donations: {
          where: {
            date: { gte: startDate, lte: endDate },
          },
          select: { amount: true },
        },
      },
    }),
    prisma.grant.findMany({
      where: {
        OR: [
          { submittedDate: { gte: startDate, lte: endDate } },
          { decisionDate: { gte: startDate, lte: endDate } },
        ],
      },
      select: {
        title: true,
        funderName: true,
        status: true,
        amountRequested: true,
        amountAwarded: true,
      },
    }),
  ]);

  // Resolve top donor names
  const topDonorIds = topDonors.map((d) => d.contactId);
  const topDonorContacts = await prisma.contact.findMany({
    where: { id: { in: topDonorIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const contactMap = new Map(
    topDonorContacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`])
  );

  return {
    summary: {
      totalRaised: Number(donations._sum.amount ?? 0),
      donationCount: donations._count,
      averageDonation: Number(donations._avg.amount ?? 0),
      activeCampaigns: campaigns.length,
      grantApplications: grants.length,
    },
    sections: [
      {
        title: "Fundraising Summary",
        data: {
          totalRaised: Number(donations._sum.amount ?? 0),
          donationCount: donations._count,
          averageDonation: Number(donations._avg.amount ?? 0),
        },
      },
      {
        title: "Top Donors",
        data: {
          donors: topDonors.map((d) => ({
            name: contactMap.get(d.contactId) ?? "Unknown",
            totalDonated: Number(d._sum.amount ?? 0),
            donationCount: d._count,
          })),
        },
      },
      {
        title: "Campaign Performance",
        data: {
          campaigns: campaigns.map((c) => {
            const raised = c.donations.reduce(
              (sum, d) => sum + Number(d.amount),
              0
            );
            return {
              name: c.name,
              status: c.status,
              target: c.budgetTarget ? Number(c.budgetTarget) : null,
              raised,
              percentOfTarget: c.budgetTarget
                ? Math.round((raised / Number(c.budgetTarget)) * 100)
                : null,
            };
          }),
        },
      },
      {
        title: "Grant Applications",
        data: {
          grants: grants.map((g) => ({
            title: g.title,
            funder: g.funderName,
            status: g.status,
            requested: g.amountRequested,
            awarded: g.amountAwarded,
          })),
        },
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateMembershipReport(
  startDate: Date,
  endDate: Date
): Promise<ReportData> {
  const [statusCounts, newMemberships, renewals, cancellations] =
    await Promise.all([
      prisma.membership.groupBy({
        by: ["status"],
        _count: true,
      }),
      prisma.membership.count({
        where: { startDate: { gte: startDate, lte: endDate } },
      }),
      prisma.membershipRenewal.count({
        where: { renewedAt: { gte: startDate, lte: endDate } },
      }),
      prisma.membership.count({
        where: {
          cancelledAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

  const totalMembers = statusCounts.reduce((sum, s) => sum + s._count, 0);
  const activeMembers =
    statusCounts.find((s) => s.status === "ACTIVE")?._count ?? 0;

  // Revenue from memberships
  const membershipRevenue = await prisma.membership.aggregate({
    where: {
      startDate: { gte: startDate, lte: endDate },
      amountPaid: { not: null },
    },
    _sum: { amountPaid: true },
  });

  return {
    summary: {
      totalMembers,
      activeMembers,
      newMemberships,
      renewals,
      cancellations,
      revenue: Number(membershipRevenue._sum.amountPaid ?? 0),
    },
    sections: [
      {
        title: "Membership Overview",
        data: {
          totalMembers,
          activeMembers,
          statusBreakdown: Object.fromEntries(
            statusCounts.map((s) => [s.status, s._count])
          ),
        },
      },
      {
        title: "Period Activity",
        data: {
          newMemberships,
          renewals,
          cancellations,
          netGrowth: newMemberships - cancellations,
        },
      },
      {
        title: "Revenue",
        data: {
          totalRevenue: Number(membershipRevenue._sum.amountPaid ?? 0),
        },
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export async function generateComplianceReport(
  startDate: Date,
  endDate: Date
): Promise<ReportData> {
  const [sars, breaches, consents] = await Promise.all([
    prisma.subjectAccessRequest.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: { id: true, status: true, createdAt: true, completedAt: true },
    }),
    prisma.dataBreach.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: {
        id: true,
        severity: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.consentRecord.count({
      where: { recordedAt: { gte: startDate, lte: endDate } },
    }),
  ]);

  const sarsByStatus: Record<string, number> = {};
  sars.forEach((s) => {
    sarsByStatus[s.status] = (sarsByStatus[s.status] ?? 0) + 1;
  });

  const breachesBySeverity: Record<string, number> = {};
  breaches.forEach((b) => {
    breachesBySeverity[b.severity] =
      (breachesBySeverity[b.severity] ?? 0) + 1;
  });

  return {
    summary: {
      totalSARs: sars.length,
      totalBreaches: breaches.length,
      consentRecords: consents,
    },
    sections: [
      {
        title: "Subject Access Requests",
        data: {
          total: sars.length,
          statusBreakdown: sarsByStatus,
        },
      },
      {
        title: "Data Breaches",
        data: {
          total: breaches.length,
          severityBreakdown: breachesBySeverity,
        },
      },
      {
        title: "Consent Management",
        data: {
          newConsentRecords: consents,
        },
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}
