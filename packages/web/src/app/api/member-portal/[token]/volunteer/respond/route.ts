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
  const { broadcastId, response, message } = body;

  if (!broadcastId || !response) {
    return NextResponse.json(
      { error: "broadcastId and response are required" },
      { status: 400 }
    );
  }

  if (!["ACCEPTED", "DECLINED", "TENTATIVE"].includes(response)) {
    return NextResponse.json(
      { error: "response must be ACCEPTED, DECLINED, or TENTATIVE" },
      { status: 400 }
    );
  }

  // Check the broadcast exists and is still open
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
  });

  if (!broadcast) {
    return NextResponse.json(
      { error: "Broadcast not found" },
      { status: 404 }
    );
  }

  if (broadcast.status !== "OPEN") {
    return NextResponse.json(
      { error: "This broadcast is no longer open" },
      { status: 400 }
    );
  }

  if (new Date(broadcast.expiresAt) < new Date()) {
    return NextResponse.json(
      { error: "This broadcast has expired" },
      { status: 400 }
    );
  }

  // Upsert the response (create or update)
  const existing = await prisma.broadcastResponse.findFirst({
    where: {
      broadcastId,
      volunteerId: volunteer.id,
    },
  });

  if (existing) {
    await prisma.broadcastResponse.update({
      where: { id: existing.id },
      data: {
        response,
        message: message || null,
        respondedAt: new Date(),
      },
    });
  } else {
    await prisma.broadcastResponse.create({
      data: {
        broadcastId,
        volunteerId: volunteer.id,
        response,
        message: message || null,
        respondedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ success: true, response });
}
