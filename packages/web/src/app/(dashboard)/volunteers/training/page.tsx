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

  const expiring1m = expiringTrainings.filter(t => t.expiryDate && t.expiryDate <= oneMonth);
  const expiring3m = expiringTrainings.filter(t => t.expiryDate && t.expiryDate > oneMonth && t.expiryDate <= threeMonths);
  const expiring6m = expiringTrainings.filter(t => t.expiryDate && t.expiryDate > threeMonths && t.expiryDate <= sixMonths);

  function daysUntilExpiry(expiryDate: Date): number {
    return Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  async function createCourse(formData: FormData) {
    "use server";
    await requireAuth();

    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const isMandatory = formData.get("isMandatory") === "on";
    const validityMonths = formData.get("validityMonths")
      ? parseInt(formData.get("validityMonths") as string)
      : null;

    await prisma.trainingCourse.create({
      data: {
        name,
        description,
        isMandatory,
        validityMonths,
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
            <div className="flex items-end">
              <Button type="submit" className="w-full">
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
                      {course.validityMonths ? `${course.validityMonths}m` : "—"}
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

      {/* Coming Up - Training Expiring Soon */}
      {(expiring1m.length > 0 || expiring3m.length > 0 || expiring6m.length > 0) && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">Coming Up</h2>
            <span className="text-sm text-gray-500">Training certifications expiring in the next 6 months</span>
          </div>

          {[
            { label: "Within 1 Month", items: expiring1m, color: "border-l-red-500", textColor: "text-red-600" },
            { label: "1 - 3 Months", items: expiring3m, color: "border-l-orange-500", textColor: "text-orange-600" },
            { label: "3 - 6 Months", items: expiring6m, color: "border-l-yellow-500", textColor: "text-yellow-600" },
          ].map(group => group.items.length > 0 && (
            <div key={group.label} className="mb-4 last:mb-0">
              <h3 className={`text-sm font-semibold ${group.textColor} mb-2`}>
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
                          {training.completedDate ? formatDate(training.completedDate) : "---"}
                        </td>
                        <td className="px-4 py-2">{training.expiryDate ? formatDate(training.expiryDate) : "---"}</td>
                        <td className="px-4 py-2">
                          {training.expiryDate && (
                            <Badge className={daysUntilExpiry(training.expiryDate) <= 30 ? "bg-red-100 text-red-800" : daysUntilExpiry(training.expiryDate) <= 90 ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800"}>
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
