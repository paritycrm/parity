"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function duplicateEvent(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const newName = formData.get("newName") as string;
  const newStartDate = formData.get("newStartDate") as string;

  const original = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      incomeLines: true,
      costLines: true,
      finance: true,
      sponsors: true,
    },
  });

  if (!original) return;

  const newEvent = await prisma.event.create({
    data: {
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      startDate: newStartDate ? new Date(newStartDate) : new Date(),
      location: original.location,
      capacity: original.capacity,
      campaignId: original.campaignId,
      ledgerCodeId: original.ledgerCodeId,
      status: "PLANNED",
      createdById: session.id,
    },
  });

  // Duplicate income lines
  if (original.incomeLines.length > 0) {
    await prisma.eventIncomeLine.createMany({
      data: original.incomeLines.map(line => ({
        eventId: newEvent.id,
        category: line.category,
        label: line.label,
        description: line.description,
        estimated: line.estimated,
        actual: 0,
        sortOrder: line.sortOrder,
        organisationId: line.organisationId,
      })),
    });
  }

  // Duplicate cost lines
  if (original.costLines.length > 0) {
    await prisma.eventCostLine.createMany({
      data: original.costLines.map(line => ({
        eventId: newEvent.id,
        organisationId: line.organisationId,
        category: line.category,
        label: line.label,
        description: line.description,
        estimated: line.estimated,
        actual: 0,
        sortOrder: line.sortOrder,
      })),
    });
  }

  // Duplicate finance targets
  if (original.finance) {
    await prisma.eventFinance.create({
      data: {
        eventId: newEvent.id,
        incomeTarget: original.finance.incomeTarget,
        costTarget: original.finance.costTarget,
        profitTarget: original.finance.profitTarget,
      },
    });
  }

  // Duplicate sponsors
  if (original.sponsors.length > 0) {
    await prisma.eventSponsor.createMany({
      data: original.sponsors.map(s => ({
        eventId: newEvent.id,
        organisationId: s.organisationId,
        name: s.name,
        logoUrl: s.logoUrl,
        sponsorshipLevel: s.sponsorshipLevel,
        amount: s.amount,
        notes: s.notes,
      })),
    });
  }

  await logAudit({
    userId: session.id,
    action: "CREATE",
    entityType: "Event",
    entityId: newEvent.id,
    details: { action: "DUPLICATE", sourceEventId: eventId },
  });

  redirect(`/events/${newEvent.id}`);
}

export async function addSponsor(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const name = formData.get("name") as string;
  const sponsorshipLevel = (formData.get("sponsorshipLevel") as string) || "MINOR";
  const amount = formData.get("amount") ? parseFloat(formData.get("amount") as string) : null;
  const logoUrl = (formData.get("logoUrl") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const organisationId = (formData.get("organisationId") as string) || null;

  await prisma.eventSponsor.create({
    data: {
      eventId,
      name,
      sponsorshipLevel,
      amount,
      logoUrl,
      notes,
      organisationId,
    },
  });

  await logAudit({
    userId: session.id,
    action: "CREATE",
    entityType: "EventSponsor",
    entityId: eventId,
    details: { name, sponsorshipLevel, amount },
  });

  revalidatePath(`/events/${eventId}`);
}

export async function removeSponsor(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sponsorId = formData.get("sponsorId") as string;
  const eventId = formData.get("eventId") as string;

  await prisma.eventSponsor.delete({
    where: { id: sponsorId },
  });

  await logAudit({
    userId: session.id,
    action: "DELETE",
    entityType: "EventSponsor",
    entityId: eventId,
    details: { sponsorId },
  });

  revalidatePath(`/events/${eventId}`);
}
