import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

interface Filter {
  field: string;
  operator: string;
  value: any;
}

interface ReportQuery {
  entity: "CONTACTS" | "DONATIONS" | "EVENTS" | "CAMPAIGNS" | "VOLUNTEERS" | "MEMBERSHIPS";
  filters?: Filter[];
  columns?: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ReportQuery = await req.json();
    const {
      entity,
      filters = [],
      columns = [],
      groupBy,
      sortBy,
      sortDir = "asc",
      page = 1,
      pageSize = 50,
    } = body;

    if (!entity || !["CONTACTS", "DONATIONS", "EVENTS", "CAMPAIGNS", "VOLUNTEERS", "MEMBERSHIPS"].includes(entity)) {
      return NextResponse.json(
        { error: "Invalid entity type" },
        { status: 400 }
      );
    }

    let data: any[] = [];
    let total = 0;
    const finalColumns = columns.length > 0 ? columns : getDefaultColumns(entity);

    switch (entity) {
      case "CONTACTS":
        ({ data, total } = await getContactsReport(
          filters,
          finalColumns,
          groupBy,
          sortBy,
          sortDir,
          page,
          pageSize
        ));
        break;
      case "DONATIONS":
        ({ data, total } = await getDonationsReport(
          filters,
          finalColumns,
          groupBy,
          sortBy,
          sortDir,
          page,
          pageSize
        ));
        break;
      case "EVENTS":
        ({ data, total } = await getEventsReport(
          filters,
          finalColumns,
          groupBy,
          sortBy,
          sortDir,
          page,
          pageSize
        ));
        break;
      case "CAMPAIGNS":
        ({ data, total } = await getCampaignsReport(
          filters,
          finalColumns,
          groupBy,
          sortBy,
          sortDir,
          page,
          pageSize
        ));
        break;
      case "VOLUNTEERS":
        ({ data, total } = await getVolunteersReport(
          filters,
          finalColumns,
          groupBy,
          sortBy,
          sortDir,
          page,
          pageSize
        ));
        break;
      case "MEMBERSHIPS":
        ({ data, total } = await getMembershipsReport(
          filters,
          finalColumns,
          groupBy,
          sortBy,
          sortDir,
          page,
          pageSize
        ));
        break;
    }

    return NextResponse.json({
      data,
      total,
      columns: finalColumns,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Report builder error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}

function getDefaultColumns(entity: string): string[] {
  const defaults: Record<string, string[]> = {
    CONTACTS: ["firstName", "lastName", "email", "phone", "postcode", "type", "status", "createdAt"],
    DONATIONS: ["amount", "date", "type", "method", "contactName", "campaignName", "giftAidEligible"],
    EVENTS: ["name", "type", "status", "startDate", "endDate", "attendeeCount"],
    CAMPAIGNS: ["name", "type", "status", "budgetTarget", "actualRaised", "progress"],
    VOLUNTEERS: ["contactName", "status", "hoursLogged", "department"],
    MEMBERSHIPS: ["contactName", "type", "status", "startDate", "expiryDate", "amount"],
  };
  return defaults[entity] || [];
}

function buildWhereClause(filters: Filter[]): any {
  if (!filters.length) return {};

  const where: any = {};

  for (const filter of filters) {
    const { field, operator, value } = filter;

    switch (operator) {
      case "equals":
        where[field] = value;
        break;
      case "contains":
        where[field] = { contains: value, mode: "insensitive" };
        break;
      case "gt":
        where[field] = { gt: value };
        break;
      case "gte":
        where[field] = { gte: value };
        break;
      case "lt":
        where[field] = { lt: value };
        break;
      case "lte":
        where[field] = { lte: value };
        break;
      case "between":
        where[field] = { gte: value[0], lte: value[1] };
        break;
      case "in":
        where[field] = { in: value };
        break;
      case "isNull":
        where[field] = value ? null : { not: null };
        break;
      case "isNotNull":
        where[field] = value ? { not: null } : null;
        break;
      default:
        where[field] = value;
    }
  }

  return where;
}

async function getContactsReport(
  filters: Filter[],
  columns: string[],
  groupBy?: string,
  sortBy?: string,
  sortDir: "asc" | "desc" = "asc",
  page: number = 1,
  pageSize: number = 50
) {
  const where = buildWhereClause(filters);
  const skip = (page - 1) * pageSize;

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        postcode: true,
        type: true,
        types: true,
        status: true,
        createdAt: true,
        organisationId: true,
        donations: true,
      },
      orderBy: sortBy
        ? { [sortBy]: sortDir }
        : { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const data = contacts.map((contact) => {
    const result: any = {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      postcode: contact.postcode,
      type: contact.types.length > 0 ? contact.types[0] : contact.type,
      status: contact.status,
      createdAt: contact.createdAt.toISOString().split("T")[0],
      donationCount: contact.donations.length,
      totalDonations: contact.donations.reduce((sum, d) => sum + Number(d.amount), 0),
      lastDonationDate: contact.donations.length > 0
        ? contact.donations[0].date.toISOString().split("T")[0]
        : null,
    };

    const filtered: any = {};
    for (const col of columns) {
      filtered[col] = result[col] || "";
    }
    return filtered;
  });

  return { data, total };
}

async function getDonationsReport(
  filters: Filter[],
  columns: string[],
  groupBy?: string,
  sortBy?: string,
  sortDir: "asc" | "desc" = "asc",
  page: number = 1,
  pageSize: number = 50
) {
  const where = buildWhereClause(filters);
  const skip = (page - 1) * pageSize;

  const [total, donations] = await Promise.all([
    prisma.donation.count({ where }),
    prisma.donation.findMany({
      where,
      select: {
        id: true,
        amount: true,
        date: true,
        type: true,
        method: true,
        isGiftAidable: true,
        giftAidClaimed: true,
        contact: {
          select: { firstName: true, lastName: true },
        },
        campaign: {
          select: { name: true },
        },
      },
      orderBy: sortBy
        ? { [sortBy]: sortDir }
        : { date: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const data = donations.map((donation) => ({
    amount: Number(donation.amount),
    date: donation.date.toISOString().split("T")[0],
    type: donation.type,
    method: donation.method || "",
    contactName: `${donation.contact.firstName} ${donation.contact.lastName}`,
    campaignName: donation.campaign?.name || "",
    giftAidEligible: donation.isGiftAidable,
    giftAidClaimed: donation.giftAidClaimed,
  }));

  return { data, total };
}

async function getEventsReport(
  filters: Filter[],
  columns: string[],
  groupBy?: string,
  sortBy?: string,
  sortDir: "asc" | "desc" = "asc",
  page: number = 1,
  pageSize: number = 50
) {
  const where = buildWhereClause(filters);
  const skip = (page - 1) * pageSize;

  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      include: {
        _count: { select: { attendees: true } },
        donations: { select: { amount: true } },
      },
      orderBy: sortBy
        ? { [sortBy]: sortDir }
        : { startDate: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const data = events.map((event: any) => ({
    name: event.name,
    type: event.type || "",
    status: event.status,
    startDate: event.startDate.toISOString().split("T")[0],
    endDate: event.endDate ? event.endDate.toISOString().split("T")[0] : "",
    attendeeCount: event._count?.attendees || 0,
    totalIncome: event.donations?.reduce((sum: number, d: any) => sum + Number(d.amount), 0) || 0,
  }));

  return { data, total };
}

async function getCampaignsReport(
  filters: Filter[],
  columns: string[],
  groupBy?: string,
  sortBy?: string,
  sortDir: "asc" | "desc" = "asc",
  page: number = 1,
  pageSize: number = 50
) {
  const where = buildWhereClause(filters);
  const skip = (page - 1) * pageSize;

  const [total, campaigns] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        budgetTarget: true,
        actualRaised: true,
        startDate: true,
        endDate: true,
      },
      orderBy: sortBy
        ? { [sortBy]: sortDir }
        : { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const data = campaigns.map((campaign) => ({
    name: campaign.name,
    type: campaign.type || "",
    status: campaign.status,
    budgetTarget: campaign.budgetTarget ? Number(campaign.budgetTarget) : 0,
    actualRaised: Number(campaign.actualRaised),
    startDate: campaign.startDate ? campaign.startDate.toISOString().split("T")[0] : "",
    endDate: campaign.endDate ? campaign.endDate.toISOString().split("T")[0] : "",
    progress: campaign.budgetTarget
      ? Math.round((Number(campaign.actualRaised) / Number(campaign.budgetTarget)) * 100)
      : 0,
  }));

  return { data, total };
}

async function getVolunteersReport(
  filters: Filter[],
  columns: string[],
  groupBy?: string,
  sortBy?: string,
  sortDir: "asc" | "desc" = "asc",
  page: number = 1,
  pageSize: number = 50
) {
  const skip = (page - 1) * pageSize;

  // VolunteerProfile doesn't use standard Prisma filters the same way
  const profiles = await prisma.volunteerProfile.findMany({
    select: {
      id: true,
      contact: {
        select: { firstName: true, lastName: true },
      },
      status: true,
      hoursLogs: {
        select: { hours: true },
      },
      departments: {
        select: {
          department: { select: { name: true } },
        },
      },
    },
    orderBy: sortBy
      ? { [sortBy]: sortDir }
      : { createdAt: "desc" },
    skip,
    take: pageSize,
  });

  const total = await prisma.volunteerProfile.count();

  const data = profiles.map((vol) => ({
    contactName: `${vol.contact.firstName} ${vol.contact.lastName}`,
    status: vol.status,
    hoursLogged: vol.hoursLogs.reduce((sum, h) => sum + h.hours, 0),
    department: vol.departments.map((d) => d.department.name).join(", "),
    skills: "",
  }));

  return { data, total };
}

async function getMembershipsReport(
  filters: Filter[],
  columns: string[],
  groupBy?: string,
  sortBy?: string,
  sortDir: "asc" | "desc" = "asc",
  page: number = 1,
  pageSize: number = 50
) {
  const where = buildWhereClause(filters);
  const skip = (page - 1) * pageSize;

  const [total, memberships] = await Promise.all([
    prisma.membership.count({ where }),
    prisma.membership.findMany({
      where,
      select: {
        id: true,
        contact: {
          select: { firstName: true, lastName: true },
        },
        membershipType: {
          select: { name: true },
        },
        status: true,
        startDate: true,
        endDate: true,
        amountPaid: true,
      },
      orderBy: sortBy
        ? { [sortBy]: sortDir }
        : { startDate: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const data = memberships.map((mem) => ({
    contactName: `${mem.contact.firstName} ${mem.contact.lastName}`,
    type: mem.membershipType.name,
    status: mem.status,
    startDate: mem.startDate.toISOString().split("T")[0],
    expiryDate: mem.endDate.toISOString().split("T")[0],
    amount: mem.amountPaid ? Number(mem.amountPaid) : 0,
  }));

  return { data, total };
}
