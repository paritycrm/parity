import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sendBroadcastNotifications } from "@/lib/broadcast-sender";
import { BroadcastForm } from "./broadcast-form";

export default async function NewBroadcastPage() {
  const [departments, skills] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.skill.findMany({
      select: { id: true, name: true, departmentId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  async function createBroadcast(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const skillIds = formData.getAll("skills") as string[];
    const expiresInHours = parseInt(formData.get("expiresInHours") as string) || 4;

    const broadcast = await prisma.broadcast.create({
      data: {
        title: formData.get("title") as string,
        message: formData.get("message") as string,
        urgency: formData.get("urgency") as string,
        departmentId: (formData.get("departmentId") as string) || null,
        targetDate: formData.get("targetDate") as string,
        targetStartTime: formData.get("targetStartTime") as string,
        targetEndTime: formData.get("targetEndTime") as string,
        maxRespondents: parseInt(formData.get("maxRespondents") as string) || 1,
        createdById: session.id,
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
        skills: {
          create: skillIds.map((id) => ({ skillId: id })),
        },
      },
    });

    // Send notifications (email + push) to eligible volunteers
    // Fire-and-forget so the redirect isn't delayed
    sendBroadcastNotifications({
      id: broadcast.id,
      title: broadcast.title,
      message: broadcast.message,
      urgency: broadcast.urgency,
      targetDate: broadcast.targetDate,
      targetStartTime: broadcast.targetStartTime,
      targetEndTime: broadcast.targetEndTime,
      maxRespondents: broadcast.maxRespondents,
      departmentId: broadcast.departmentId,
      createdById: broadcast.createdById,
      skills: skillIds.map((id) => ({ skillId: id })),
    }).catch((err) => console.error("[broadcast] Send error:", err));

    redirect(`/broadcasts/${broadcast.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/broadcasts" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Broadcast</h1>
      </div>

      <BroadcastForm
        departments={departments}
        skills={skills}
        createBroadcast={createBroadcast}
      />
    </div>
  );
}
