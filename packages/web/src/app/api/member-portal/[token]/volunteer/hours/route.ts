import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
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

  // Find the volunteer profile
  const volunteer = await prisma.volunteerProfile.findUnique({
    where: { contactId: portalToken.contactId },
  });

  if (!volunteer) {
    return NextResponse.json(
      { error: "No volunteer profile found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const { date, hours, description, departmentId } = body;

  if (!date || !hours) {
    return NextResponse.json(
      { error: "date and hours are required" },
      { status: 400 }
    );
  }

  const parsedHours = parseFloat(hours);
  if (isNaN(parsedHours) || parsedHours <= 0) {
    return NextResponse.json(
      { error: "hours must be a positive number" },
      { status: 400 }
    );
  }

  if (parsedHours > 24) {
    return NextResponse.json(
      { error: "hours cannot exceed 24 in a single day" },
      { status: 400 }
    );
  }

  // If departmentId is provided, verify the volunteer belongs to that department
  if (departmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }
  }

  const hoursLog = await prisma.volunteerHoursLog.create({
    data: {
      volunteerId: volunteer.id,
      date,
      hours: parsedHours,
      description: description || null,
      departmentId: departmentId || null,
      status: "LOGGED",
    },
  });

  return NextResponse.json({
    success: true,
    hoursLog: {
      id: hoursLog.id,
      date: hoursLog.date,
      hours: hoursLog.hours,
      description: hoursLog.description,
      status: hoursLog.status,
    },
  });
}
