import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

interface Filter {
  field: string;
  operator: string;
  value: any;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { entity, filters = [], columns = [] } = body;

    if (!entity) {
      return NextResponse.json(
        { error: "Entity is required" },
        { status: 400 }
      );
    }

    let data: any[] = [];

    // Generate report data based on entity type
    // This reuses the same logic as the builder but gets all records
    switch (entity) {
      case "CONTACTS":
        data = await getContactsData(filters);
        break;
      case "DONATIONS":
        data = await getDonationsData(filters);
        break;
      case "EVENTS":
        data = await getEventsData(filters);
        break;
      case "CAMPAIGNS":
        data = await getCampaignsData(filters);
        break;
      case "VOLUNTEERS":
        data = await getVolunteersData(filters);
        break;
      case "MEMBERSHIPS":
        data = await getMembershipsData(filters);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid entity type" },
          { status: 400 }
        );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "No data to export" },
        { status: 400 }
      );
    }

    // Generate CSV
    const csv = generateCSV(data, columns);

    // Return as downloadable file
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="report-${entity.toLowerCase()}-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting report:", error);
    return NextResponse.json(
      { error: "Failed to export report" },
      { status: 500 }
    );
  }
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

async function getContactsData(filters: Filter[]) {
  const where = buildWhereClause(filters);
  const contacts = await prisma.contact.findMany({
    where,
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      postcode: true,
      type: true,
      types: true,
      status: true,
      createdAt: true,
      donations: true,
    },
  });

  return contacts.map((contact) => ({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email || "",
    phone: contact.phone || "",
    postcode: contact.postcode || "",
    type: contact.types.length > 0 ? contact.types[0] : contact.type,
    status: contact.status,
    createdAt: contact.createdAt.toISOString().split("T")[0],
    donationCount: contact.donations.length,
    totalDonations: contact.donations.reduce((sum, d) => sum + Number(d.amount), 0),
    lastDonationDate:
      contact.donations.length > 0
        ? contact.donations[0].date.toISOString().split("T")[0]
        : "",
  }));
}

async function getDonationsData(filters: Filter[]) {
  const where = buildWhereClause(filters);
  const donations = await prisma.donation.findMany({
    where,
    select: {
      amount: true,
      date: true,
      type: true,
      method: true,
      isGiftAidable: true,
      giftAidClaimed: true,
      contact: { select: { firstName: true, lastName: true } },
      campaign: { select: { name: true } },
    },
  });

  return donations.map((donation) => ({
    amount: Number(donation.amount),
    date: donation.date.toISOString().split("T")[0],
    type: donation.type,
    method: donation.method || "",
    contactName: `${donation.contact.firstName} ${donation.contact.lastName}`,
    campaignName: donation.campaign?.name || "",
    giftAidEligible: donation.isGiftAidable,
    giftAidClaimed: donation.giftAidClaimed,
  }));
}

async function getEventsData(filters: Filter[]) {
  const where = buildWhereClause(filters);
  const events = await prisma.event.findMany({
    where,
    include: {
      _count: { select: { attendees: true } },
      donations: { select: { amount: true } },
    },
  });

  return events.map((event: any) => ({
    name: event.name,
    type: event.type || "",
    status: event.status,
    startDate: event.startDate.toISOString().split("T")[0],
    endDate: event.endDate ? event.endDate.toISOString().split("T")[0] : "",
    attendeeCount: event._count?.attendees || 0,
    totalIncome: event.donations?.reduce((sum: number, d: any) => sum + Number(d.amount), 0) || 0,
  }));
}

async function getCampaignsData(filters: Filter[]) {
  const where = buildWhereClause(filters);
  const campaigns = await prisma.campaign.findMany({
    where,
    select: {
      name: true,
      type: true,
      status: true,
      budgetTarget: true,
      actualRaised: true,
      startDate: true,
      endDate: true,
    },
  });

  return campaigns.map((campaign) => ({
    name: campaign.name,
    type: campaign.type || "",
    status: campaign.status,
    budgetTarget: campaign.budgetTarget ? Number(campaign.budgetTarget) : 0,
    actualRaised: Number(campaign.actualRaised),
    startDate: campaign.startDate
      ? campaign.startDate.toISOString().split("T")[0]
      : "",
    endDate: campaign.endDate
      ? campaign.endDate.toISOString().split("T")[0]
      : "",
    progress: campaign.budgetTarget
      ? Math.round((Number(campaign.actualRaised) / Number(campaign.budgetTarget)) * 100)
      : 0,
  }));
}

async function getVolunteersData(filters: Filter[]) {
  const profiles = await prisma.volunteerProfile.findMany({
    select: {
      contact: { select: { firstName: true, lastName: true } },
      status: true,
      hoursLogs: { select: { hours: true } },
      departments: { select: { department: { select: { name: true } } } },
    },
  });

  return profiles.map((vol) => ({
    contactName: `${vol.contact.firstName} ${vol.contact.lastName}`,
    status: vol.status,
    hoursLogged: vol.hoursLogs.reduce((sum, h) => sum + h.hours, 0),
    department: vol.departments.map((d) => d.department.name).join(", "),
  }));
}

async function getMembershipsData(filters: Filter[]) {
  const where = buildWhereClause(filters);
  const memberships = await prisma.membership.findMany({
    where,
    select: {
      contact: { select: { firstName: true, lastName: true } },
      membershipType: { select: { name: true } },
      status: true,
      startDate: true,
      endDate: true,
      amountPaid: true,
    },
  });

  return memberships.map((mem) => ({
    contactName: `${mem.contact.firstName} ${mem.contact.lastName}`,
    type: mem.membershipType.name,
    status: mem.status,
    startDate: mem.startDate.toISOString().split("T")[0],
    expiryDate: mem.endDate.toISOString().split("T")[0],
    amount: mem.amountPaid ? Number(mem.amountPaid) : 0,
  }));
}

function generateCSV(data: any[], columns: string[]): string {
  if (!data.length) return "";

  // Use provided columns or infer from first row
  const headers = columns.length > 0 ? columns : Object.keys(data[0]);

  // Create header row
  const csvHeaders = headers.map(escapeCSV).join(",");

  // Create data rows
  const csvRows = data.map((row) =>
    headers.map((header) => {
      const value = row[header];
      return escapeCSV(String(value ?? ""));
    }).join(",")
  );

  return [csvHeaders, ...csvRows].join("\n");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
