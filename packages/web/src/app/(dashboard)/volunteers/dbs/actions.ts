"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function addDBSCheck(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;
  const checkDate = formData.get("checkDate") as string;
  const expiryDate = formData.get("expiryDate") as string;
  const certificateNumber = (formData.get("certificateNumber") as string) || null;
  const level = (formData.get("level") as string) || "BASIC";
  const status = (formData.get("status") as string) || "PENDING";
  const cost = formData.get("cost") ? parseFloat(formData.get("cost") as string) : null;
  const notes = (formData.get("notes") as string) || null;

  const check = await prisma.dBSCheck.create({
    data: {
      volunteerId,
      checkDate: new Date(checkDate),
      expiryDate: new Date(expiryDate),
      certificateNumber,
      level,
      status,
      cost,
      notes,
    },
  });

  await logAudit({
    userId: session.id,
    action: "CREATE",
    entityType: "DBSCheck",
    entityId: check.id,
    details: { volunteerId, level },
  });

  revalidatePath("/volunteers/dbs");
}

export async function updateDBSStatus(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const checkId = formData.get("checkId") as string;
  const status = formData.get("status") as string;

  await prisma.dBSCheck.update({
    where: { id: checkId },
    data: { status },
  });

  revalidatePath("/volunteers/dbs");
}

export async function createDBSReminder(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;
  const volunteerName = formData.get("volunteerName") as string;
  const expiryDate = formData.get("expiryDate") as string;
  const certificateNumber = formData.get("certificateNumber") as string;

  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  await prisma.reminder.create({
    data: {
      volunteerId,
      type: "DBS_EXPIRY",
      title: `DBS Check Expiring - ${volunteerName}`,
      message: `DBS certificate ${certificateNumber || "(no number)"} expires on ${expiry.toLocaleDateString("en-GB")} (${daysUntil} days). Please arrange renewal.`,
      triggerDate: new Date(),
      isAutomatic: false,
      createdById: session.id,
    },
  });

  await logAudit({
    userId: session.id,
    action: "CREATE",
    entityType: "Reminder",
    entityId: volunteerId,
    details: { type: "DBS_EXPIRY", volunteerName },
  });

  revalidatePath("/volunteers/dbs");
}
