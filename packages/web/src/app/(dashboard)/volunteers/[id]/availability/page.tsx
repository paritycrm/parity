import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Plus, Trash2, Repeat } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ui/confirm-button";

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const volunteer = await prisma.volunteerProfile.findUnique({
    where: { id },
    include: {
      contact: true,
      availability: {
        orderBy: { dayOfWeek: "asc" },
      },
    },
  });

  if (!volunteer) notFound();

  // Group availability by day
  const byDay = new Map<string, typeof volunteer.availability>();
  for (const day of DAYS_OF_WEEK) {
    byDay.set(day, []);
  }
  for (const slot of volunteer.availability) {
    const existing = byDay.get(slot.dayOfWeek) || [];
    existing.push(slot);
    byDay.set(slot.dayOfWeek, existing);
  }

  async function addAvailability(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");

    const volunteerId = formData.get("volunteerId") as string;
    const dayOfWeek = formData.get("dayOfWeek") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    const isRecurring = formData.get("isRecurring") === "on";
    const specificDate = (formData.get("specificDate") as string) || null;
    const notes = (formData.get("notes") as string) || null;

    if (!volunteerId || !dayOfWeek || !startTime || !endTime) return;

    await prisma.availability.create({
      data: {
        volunteerId,
        dayOfWeek,
        startTime,
        endTime,
        isRecurring,
        specificDate: isRecurring ? null : specificDate,
        notes,
      },
    });

    revalidatePath(`/volunteers/${volunteerId}/availability`);
  }

  async function removeAvailability(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");

    const availabilityId = formData.get("availabilityId") as string;
    const volunteerId = formData.get("volunteerId") as string;
    if (!availabilityId) return;

    await prisma.availability.delete({
      where: { id: availabilityId },
    });

    revalidatePath(`/volunteers/${volunteerId}/availability`);
  }

  const volunteerName = `${volunteer.contact.firstName} ${volunteer.contact.lastName}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/crm/contacts/${volunteer.contactId}`}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {volunteerName}
        </Link>
        <div className="flex items-center gap-3">
          <CalendarDays className="h-7 w-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Availability for {volunteerName}
            </h1>
            <p className="text-gray-500 mt-1">
              Manage when this volunteer is available.
            </p>
          </div>
        </div>
      </div>

      {/* Add Availability Form */}
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Add Availability Slot
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          <form action={addAvailability} className="space-y-4">
            <input type="hidden" name="volunteerId" value={id} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Day of Week
                </label>
                <select
                  name="dayOfWeek"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Select day --</option>
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time
                </label>
                <Input name="startTime" type="time" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time
                </label>
                <Input name="endTime" type="time" required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  name="isRecurring"
                  id="isRecurring"
                  defaultChecked
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor="isRecurring"
                  className="text-sm font-medium text-gray-700"
                >
                  Recurring (every week)
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Specific Date (if not recurring)
                </label>
                <Input name="specificDate" type="date" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  rows={1}
                  placeholder="e.g. Prefers morning shifts"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Slot
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Availability Grid by Day */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Current Availability ({volunteer.availability.length} slot
            {volunteer.availability.length !== 1 ? "s" : ""})
          </h2>
        </CardHeader>
        <CardContent>
          {volunteer.availability.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">
              No availability slots set. Use the form above to add availability.
            </p>
          ) : (
            <div className="space-y-4">
              {DAYS_OF_WEEK.map((day) => {
                const slots = byDay.get(day) || [];
                if (slots.length === 0) return null;

                return (
                  <div key={day}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">{day}</h3>
                    <div className="space-y-2">
                      {slots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-900">
                              {slot.startTime} - {slot.endTime}
                            </span>
                            {slot.isRecurring ? (
                              <Badge
                                variant="outline"
                                className="bg-blue-50 text-blue-700 border-blue-200"
                              >
                                <Repeat className="h-3 w-3 mr-1" />
                                Recurring
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                {slot.specificDate || "One-off"}
                              </Badge>
                            )}
                            {slot.notes && (
                              <span className="text-xs text-gray-500">{slot.notes}</span>
                            )}
                          </div>
                          <form action={removeAvailability} className="inline">
                            <input
                              type="hidden"
                              name="availabilityId"
                              value={slot.id}
                            />
                            <input
                              type="hidden"
                              name="volunteerId"
                              value={id}
                            />
                            <ConfirmButton
                              message="Remove this availability slot?"
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </ConfirmButton>
                          </form>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
