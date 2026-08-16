import { formatDate, formatShortDate } from '@/lib/utils';
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Plus, Trash2, Building, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function TrainingPage() {
  await requireAuth();

  const now = new Date();
  const oneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const threeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const sixMonths = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

  const [courses, overdueCourses, expiringTrainings] = await Promise.all([
    prisma.trainingCourse.findMany({
      include: {
        _count: { select: { volunteerTrainings: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.volunteerTraining.findMany({
      where: {
        OR: [
          { status: "EXPIRED" },
          {
            AND: [
              { status: "COMPLETED" },
              { expiryDate: { lt: new Date() } },
            ],
          },
        ],
      },
      include: {
        volunteer: { include: { contact: true } },
        course: true,
      },
      orderBy: { expiryDate: "asc" },
      take: 100,
    }),
    // Training expiring in next 6 months
    prisma.volunteerTraining.findMany({
      where: {
        status: "COMPLETED",
        expiryDate: {
          gte: now,
          lte: sixMonths,
        },
      },
      include: {
        volunteer: { include: { contact: true } },
        course: true,
      },
      orderBy: { expiryDate: "asc" },
    }),
  ]);

  function daysUntilExpiry(expiryDate: Date): number {
    return Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  function monthsUntilExpiry(expiryDate: Date): number {
    return (expiryDate.getFullYear() - now.getFullYear()) * 12 + (expiryDate.getMonth() - now.getMonth());
  }

  // Compute RAG status per training using the course's own thresholds
  type RagStatus = "red" | "amber" | "green";
  function getRag(training: { expiryDate: Date | null; course: { amberMonths: number | null; redMonths: number | null } }): RagStatus {
    if (!training.expiryDate) return "green";
    const months = monthsUntilExpiry(training.expiryDate);
    const red = training.course.redMonths ?? 1;
    const amber = training.course.amberMonths ?? 3;
    if (months <= red) return "red";
    if (months <= amber) return "amber";
    return "green";
  }

  const ragTrainings = expiringTrainings.map(t => ({ ...t, rag: getRag(t) }));
  const redTrainings = ragTrainings.filter(t => t.rag === "red");
  const amberTrainings = ragTrainings.filter(t => t.rag === "amber");
  const greenTrainings = ragTrainings.filter(t => t.rag === "green");

  async function createCourse(formData: FormData) {
    "use server";
    await requireAuth();

    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const isMandatory = formData.get("isMandatory") === "on";
    const validityMonths = formData.get("validityMonths")
      ? parseInt(formData.get("validityMonths") as string)
      : null;
    const amberMonths = formData.get("amberMonths")
      ? parseInt(formData.get("amberMonths") as string)
      : 3;
    const redMonths = formData.get("redMonths")
      ? parseInt(formData.get("redMonths") as string)
      : 1;

    await prisma.trainingCourse.create({
      data: {
        name,
        description,
        isMandatory,
        validityMonths,
        amberMonths,
        redMonths,
      },
    });

    redirect("/volunteers/training");
  }

  async function toggleMandatory(formData: FormData) {
    "use server";
    await requireAuth();

    const id = formData.get("id") as string;
    const currentValue = formData.get("currentValue") === "true";

    await prisma.trainingCourse.update({
      where: { id },
      data: { isMandatory: !currentValue },
    });

    redirect("/volunteers/training");
  }

  async function deleteCourse(formData: FormData) {
    "use server";
    await requireAuth();

    const id = formData.get("id") as string;
    await prisma.trainingCourse.delete({
      where: { id },
    });

    redirect("/volunteers/training");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Courses</h1>
          <p className="text-gray-500 mt-1">
            Manage volunteer training courses and certifications
          </p>
        </div>
        <Link href="/volunteers/training/dept-training">
          <Button variant="outline" className="gap-1">
            <Building className="h-4 w-4" />
            Department Requirements
          </Button>
        </Link>
      </div>

      {/* Create form */}
      <Card className="p-4">
        <form action={createCourse} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Course Name
              </label>
              <input
                name="name"
                required
                placeholder="e.g. First Aid"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                name="description"
                placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Validity (months)
              </label>
              <input
                name="validityMonths"
                type="number"
                placeholder="e.g. 12"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  name="isMandatory"
                  type="checkbox"
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">
                  Mandatory
                </span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Amber warning (months before expiry)
                </span>
              </label>
              <input
                name="amberMonths"
                type="number"
                defaultValue="3"
                min="1"
                placeholder="3"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  Red warning (months before expiry)
                </span>
              </label>
              <input
                name="redMonths"
                type="number"
                defaultValue="1"
                min="1"
                placeholder="1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-end lg:col-span-2">
              <Button type="submit" className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" /> Add Course
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Courses table */}
      {courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No training courses"
          description="Create your first training course to track volunteer certifications."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mandatory
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Validity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    RAG Thresholds
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Enrolled
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {courses.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {course.name}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {course.description || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <form action={toggleMandatory} className="inline">
                        <input type="hidden" name="id" value={course.id} />
                        <input
                          type="hidden"
                          name="currentValue"
                          value={String(course.isMandatory)}
                        />
                        <button
                          type="submit"
                          className="hover:underline"
                        >
                          <Badge
                            variant={
                              course.isMandatory ? "default" : "outline"
                            }
                          >
                            {course.isMandatory ? "Yes" : "No"}
                          </Badge>
                        </button>
                      </form>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {course.validityMonths ? `${course.validityMonths} months` : "Never expires"}
                    </td>
                    <td className="px-6 py-4">
                      {course.validityMonths ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />{course.amberMonths ?? 3}m</span>
                          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{course.redMonths ?? 1}m</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {course._count.volunteerTrainings}
                    </td>
                    <td className="px-6 py-4">
                      <form action={deleteCourse} className="inline">
                        <input type="hidden" name="id" value={course.id} />
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-900 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Coming Up - Training Expiring Soon (RAG based on per-course thresholds) */}
      {(redTrainings.length > 0 || amberTrainings.length > 0 || greenTrainings.length > 0) && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">Coming Up for Renewal</h2>
            <span className="text-sm text-gray-500">Based on each course&apos;s RAG thresholds</span>
          </div>

          {[
            { label: "Red — Urgent", items: redTrainings, color: "border-l-red-500", textColor: "text-red-600", dotColor: "bg-red-500" },
            { label: "Amber — Approaching", items: amberTrainings, color: "border-l-amber-400", textColor: "text-amber-600", dotColor: "bg-amber-400" },
            { label: "Green — Upcoming", items: greenTrainings, color: "border-l-green-500", textColor: "text-green-600", dotColor: "bg-green-500" },
          ].map(group => group.items.length > 0 && (
            <div key={group.label} className="mb-4 last:mb-0">
              <h3 className={`text-sm font-semibold ${group.textColor} mb-2 flex items-center gap-1.5`}>
                <span className={`h-2.5 w-2.5 rounded-full ${group.dotColor}`} />
                {group.label} ({group.items.length})
              </h3>
              <div className={`border-l-4 ${group.color} bg-gray-50 rounded-r-lg overflow-hidden`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Volunteer</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Course</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Completed</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Expiry Date</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Days Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(training => (
                      <tr key={training.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2">
                          <Link href={`/crm/contacts/${training.volunteer.contactId}`} className="text-indigo-600 hover:underline font-medium">
                            {training.volunteer.contact.firstName} {training.volunteer.contact.lastName}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{training.course.name}</td>
                        <td className="px-4 py-2 text-gray-500">
                          {training.completedDate ? formatDate(training.completedDate) : "—"}
                        </td>
                        <td className="px-4 py-2">{training.expiryDate ? formatDate(training.expiryDate) : "—"}</td>
                        <td className="px-4 py-2">
                          {training.expiryDate && (
                            <Badge className={
                              training.rag === "red" ? "bg-red-100 text-red-800" :
                              training.rag === "amber" ? "bg-amber-100 text-amber-800" :
                              "bg-green-100 text-green-800"
                            }>
                              {daysUntilExpiry(training.expiryDate)}d
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Overdue training section */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Overdue Training
        </h2>
        {overdueCourses.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-gray-500">
              No overdue training courses.
            </p>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Volunteer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Course
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expiry Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {overdueCourses.map((training) => (
                    <tr
                      key={training.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">
                          {training.volunteer.contact.firstName}{" "}
                          {training.volunteer.contact.lastName}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {training.course.name}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="destructive">
                          {training.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {training.expiryDate
                          ? formatDate(training.expiryDate)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
