import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Validate the MemberPortalToken
  const portalToken = await prisma.memberPortalToken.findUnique({
    where: { token },
    include: { contact: true },
  });

  if (!portalToken) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  if (portalToken.expiresAt && new Date(portalToken.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Token has expired" }, { status: 410 });
  }

  // Find the volunteer profile for this contact
  const volunteer = await prisma.volunteerProfile.findUnique({
    where: { contactId: portalToken.contactId },
    include: {
      departments: { include: { department: true } },
      skills: { include: { skill: true } },
    },
  });

  if (!volunteer) {
    return NextResponse.json(
      { error: "No volunteer profile found for this contact" },
      { status: 404 }
    );
  }

  const today = new Date().toISOString().split("T")[0];

  // Fetch upcoming assignments, active broadcasts, and recent hours in parallel
  const [assignments, broadcasts, hoursLogs] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        volunteerId: volunteer.id,
        date: { gte: today },
        status: { not: "CANCELLED" },
      },
      include: { department: true },
      orderBy: { date: "asc" },
      take: 5,
    }),
    prisma.broadcast.findMany({
      where: {
        status: "OPEN",
        expiresAt: { gt: new Date() },
      },
      include: {
        department: true,
        responses: {
          where: { volunteerId: volunteer.id },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.volunteerHoursLog.findMany({
      where: { volunteerId: volunteer.id },
      include: { department: true },
      orderBy: { date: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    contact: {
      id: portalToken.contact.id,
      firstName: portalToken.contact.firstName,
      lastName: portalToken.contact.lastName,
      email: portalToken.contact.email,
    },
    volunteer: {
      id: volunteer.id,
      status: volunteer.status,
      startDate: volunteer.startDate,
      endDate: volunteer.endDate,
      desiredHoursPerWeek: volunteer.desiredHoursPerWeek,
      departments: volunteer.departments.map((vd) => ({
        id: vd.department.id,
        name: vd.department.name,
      })),
      skills: volunteer.skills.map((vs) => ({
        id: vs.skill.id,
        name: vs.skill.name,
      })),
    },
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      status: a.status,
      department: a.department?.name || null,
    })),
    broadcasts: broadcasts.map((b) => ({
      id: b.id,
      title: b.title,
      message: b.message,
      urgency: b.urgency,
      targetDate: b.targetDate,
      targetStartTime: b.targetStartTime,
      targetEndTime: b.targetEndTime,
      department: b.department?.name || null,
      maxRespondents: b.maxRespondents,
      expiresAt: b.expiresAt,
      myResponse: b.responses.length > 0 ? b.responses[0].response : null,
      myMessage: b.responses.length > 0 ? b.responses[0].message : null,
    })),
    hoursLogs: hoursLogs.map((h) => ({
      id: h.id,
      date: h.date,
      hours: h.hours,
      description: h.description,
      status: h.status,
      department: h.department?.name || null,
    })),
  });
}
