import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { templateId, volunteerId, eventId, assignmentId } = await request.json();

    if (!templateId || !volunteerId) {
      return NextResponse.json(
        { error: "templateId and volunteerId are required" },
        { status: 400 }
      );
    }

    // Verify template exists and is active
    const template = await prisma.feedbackTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (!template.isActive) {
      return NextResponse.json({ error: "Template is not active" }, { status: 400 });
    }

    // Verify volunteer exists
    const volunteer = await prisma.volunteerProfile.findUnique({
      where: { id: volunteerId },
    });

    if (!volunteer) {
      return NextResponse.json({ error: "Volunteer not found" }, { status: 404 });
    }

    // Create feedback request with a 7-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const feedbackRequest = await prisma.feedbackRequest.create({
      data: {
        templateId,
        volunteerId,
        eventId: eventId || null,
        assignmentId: assignmentId || null,
        expiresAt,
      },
    });

    const feedbackUrl = `/feedback/${feedbackRequest.token}`;

    return NextResponse.json({
      id: feedbackRequest.id,
      token: feedbackRequest.token,
      feedbackUrl,
      expiresAt: feedbackRequest.expiresAt,
    });
  } catch (error) {
    console.error("Send feedback error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
