import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Target, Tag, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function EventsSettingsPage() {
  await requireRole(["ADMIN"]);

  const [settings, eventTypes] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { id: "default" } }),
    prisma.eventType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  async function saveTargets(formData: FormData) {
    "use server";
    await requireRole(["ADMIN"]);

    await prisma.systemSettings.upsert({
      where: { id: "default" },
      update: {
        eventsIncomeTarget: parseFloat(formData.get("eventsIncomeTarget") as string) || null,
        eventsCostBudget: parseFloat(formData.get("eventsCostBudget") as string) || null,
        eventsProfitTarget: parseFloat(formData.get("eventsProfitTarget") as string) || null,
      },
      create: {
        id: "default",
        eventsIncomeTarget: parseFloat(formData.get("eventsIncomeTarget") as string) || null,
        eventsCostBudget: parseFloat(formData.get("eventsCostBudget") as string) || null,
        eventsProfitTarget: parseFloat(formData.get("eventsProfitTarget") as string) || null,
      },
    });

    revalidatePath("/settings/events");
    revalidatePath("/events");
    redirect("/settings/events");
  }

  async function addEventType(formData: FormData) {
    "use server";
    await requireRole(["ADMIN"]);
    const name = (formData.get("name") as string).trim();
    const colour = (formData.get("colour") as string) || "#6366f1";
    if (!name) return;
    const maxSort = await prisma.eventType.aggregate({ _max: { sortOrder: true } });
    await prisma.eventType.create({
      data: { name, colour, isSystem: false, sortOrder: (maxSort._max.sortOrder || 0) + 1 },
    });
    revalidatePath("/settings/events");
    redirect("/settings/events");
  }

  async function toggleEventType(formData: FormData) {
    "use server";
    await requireRole(["ADMIN"]);
    const id = formData.get("id") as string;
    const current = await prisma.eventType.findUnique({ where: { id } });
    if (!current) return;
    await prisma.eventType.update({ where: { id }, data: { isActive: !current.isActive } });
    revalidatePath("/settings/events");
    redirect("/settings/events");
  }

  async function deleteEventType(formData: FormData) {
    "use server";
    await requireRole(["ADMIN"]);
    const id = formData.get("id") as string;
    const et = await prisma.eventType.findUnique({ where: { id } });
    if (!et || et.isSystem) return; // can't delete system types
    const inUse = await prisma.event.count({ where: { eventTypeId: id } });
    if (inUse > 0) {
      // just deactivate instead
      await prisma.eventType.update({ where: { id }, data: { isActive: false } });
    } else {
      await prisma.eventType.delete({ where: { id } });
    }
    revalidatePath("/settings/events");
    redirect("/settings/events");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events Settings</h1>
          <p className="text-gray-500 mt-1">Set annual targets for your events programme</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Target className="h-5 w-5" /> Annual Events Targets
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            These targets apply to the current financial year. All event income and costs will roll up into these figures on the events dashboard.
          </p>
          <form action={saveTargets} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Income Target (£)"
                name="eventsIncomeTarget"
                type="number"
                step="0.01"
                defaultValue={settings?.eventsIncomeTarget ? Number(settings.eventsIncomeTarget) : ""}
                placeholder="e.g. 400000"
              />
              <Input
                label="Cost Budget (£)"
                name="eventsCostBudget"
                type="number"
                step="0.01"
                defaultValue={settings?.eventsCostBudget ? Number(settings.eventsCostBudget) : ""}
                placeholder="e.g. 250000"
              />
              <Input
                label="Profit Target (£)"
                name="eventsProfitTarget"
                type="number"
                step="0.01"
                defaultValue={settings?.eventsProfitTarget ? Number(settings.eventsProfitTarget) : ""}
                placeholder="e.g. 150000"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Save Targets</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Event Types */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Tag className="h-5 w-5" /> Event Types
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Manage the types available when creating events. System types can be deactivated but not deleted.
          </p>

          <div className="space-y-2 mb-6">
            {eventTypes.map((et) => (
              <div key={et.id} className="flex items-center gap-3 py-2 px-3 rounded-lg border bg-white">
                <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: et.colour }} />
                <span className={`flex-1 text-sm font-medium ${!et.isActive ? "text-gray-400 line-through" : "text-gray-900"}`}>
                  {et.name}
                </span>
                {et.isSystem && (
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">System</span>
                )}
                <form action={toggleEventType} className="inline">
                  <input type="hidden" name="id" value={et.id} />
                  <Button variant="ghost" size="sm" type="submit" className="text-xs h-7 px-2">
                    {et.isActive ? "Disable" : "Enable"}
                  </Button>
                </form>
                {!et.isSystem && (
                  <form action={deleteEventType} className="inline">
                    <input type="hidden" name="id" value={et.id} />
                    <Button variant="ghost" size="sm" type="submit" className="text-xs h-7 px-2 text-red-500 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>

          <form action={addEventType} className="flex items-end gap-3">
            <div className="flex-1">
              <Input label="New Event Type" name="name" placeholder="e.g. Skydive" required />
            </div>
            <div className="w-20">
              <label className="text-sm font-medium text-gray-700 block mb-1">Colour</label>
              <input type="color" name="colour" defaultValue="#6366f1" className="h-9 w-full rounded border border-gray-200 cursor-pointer" />
            </div>
            <Button type="submit" className="flex items-center gap-1">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
