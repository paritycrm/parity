import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";

type ParamsType = Promise<{ entity: string }>;

async function getContacts() {
  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 1000,
  });

  return contacts.map((c) => ({
    "@odata.id": `Contacts('${c.id}')`,
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

async function getDonations() {
  const donations = await prisma.donation.findMany({
    select: {
      id: true,
      contactId: true,
      amount: true,
      date: true,
      type: true,
      status: true,
      reference: true,
      createdAt: true,
    },
    take: 1000,
  });

  return donations.map((d) => ({
    "@odata.id": `Donations('${d.id}')`,
    id: d.id,
    contactId: d.contactId,
    amount: Number(d.amount),
    date: d.date,
    type: d.type,
    status: d.status,
    reference: d.reference,
    createdAt: d.createdAt,
  }));
}

async function getEvents() {
  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      startDate: true,
      endDate: true,
      location: true,
      createdAt: true,
    },
    take: 1000,
  });

  return events.map((e) => ({
    "@odata.id": `Events('${e.id}')`,
    id: e.id,
    name: e.name,
    description: e.description,
    startDate: e.startDate,
    endDate: e.endDate,
    location: e.location,
    createdAt: e.createdAt,
  }));
}

async function getCampaigns() {
  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      goal: true,
      raised: true,
      status: true,
      startDate: true,
      endDate: true,
      createdAt: true,
    },
    take: 1000,
  });

  return campaigns.map((c) => ({
    "@odata.id": `Campaigns('${c.id}')`,
    id: c.id,
    name: c.name,
    description: c.description,
    goal: c.goal,
    raised: c.raised,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    createdAt: c.createdAt,
  }));
}

async function getVolunteers() {
  const volunteers = await prisma.volunteerProfile.findMany({
    select: {
      id: true,
      contactId: true,
      status: true,
      createdAt: true,
    },
    take: 1000,
  });

  return volunteers.map((v) => ({
    "@odata.id": `Volunteers('${v.id}')`,
    id: v.id,
    contactId: v.contactId,
    status: v.status,
    createdAt: v.createdAt,
  }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: ParamsType }
) {
  try {
    await requireAuth();

    const { entity } = await params;
    const entityLower = entity.toLowerCase();

    let data: unknown[] = [];

    switch (entityLower) {
      case "contacts":
        data = await getContacts();
        break;
      case "donations":
        data = await getDonations();
        break;
      case "events":
        data = await getEvents();
        break;
      case "campaigns":
        data = await getCampaigns();
        break;
      case "volunteers":
        data = await getVolunteers();
        break;
      default:
        return NextResponse.json(
          { error: "Unknown entity" },
          { status: 404 }
        );
    }

    const response = {
      "@odata.context": `${request.nextUrl.origin}/api/odata/$metadata`,
      value: data,
    };

    return NextResponse.json(response, {
      headers: {
        "Content-Type": "application/json",
        "OData-Version": "4.0",
      },
    });
  } catch (error) {
    console.error("OData error:", error);
    return NextResponse.json(
      { error: "Failed to fetch OData" },
      { status: 500 }
    );
  }
}
