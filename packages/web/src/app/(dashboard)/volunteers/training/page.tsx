import { formatDate } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Plus, Trash2, Building, Clock, Save } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function TrainingPage() {
  await requireAuth();

  const now = new Date();
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
    prisma.volunteerTraining.findMany({
      where: {
        status: "COMPLETED",
        expiryDate: { gte: now, lte: sixMonths },
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

  const ragTrainings = expiringTrainings.map((t) => ({ ...t, rag: getRag(t) }));
  const redTrainings = ragTrainings.filter((t) => t.rag === "red");
  const amberTrainings = ragTrainings.filter((t) => t.rag === "amber");
  const greenTrainings = ragTrainings.filter((t) => t.rag === "green");

  // -- Server Actions --

  async function createCourse(formData: FormData) {
    "use server";
    await requireAuth();
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const isMandatory = formData.get("isMandatory") === "on";
    const validityMonths = formData.get("validityMonths") ? parseInt(formData.get("validityMonths") as string) : null;
    const amberMonths = formData.get("amberMonths") ? parseInt(formData.get("amberMonths") as string) : 3;
    const redMonths = formData.get("redMonths") ? parseInt(formData.get("redMonths") as string) : 1;

    await prisma.trainingCourse.create({
      data: { name, description, isMandatory, validityMonths, amberMonths, redMonths },
    });
    redirect("/volunteers/training");
  }

  async function updateCourse(formData: FormData) {
    "use server";
    await requireAuth();
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;
    const isMandatory = formData.get("isMandatory") === "on";
    const validityMonths = formData.get("validityMonths") ? parseInt(formData.get("validityMonths") as string) : null;
    const amberMonths = formData.get("amberMonths") ? parseInt(formData.get("amberMonths") as string) : null;
    const redMonths = formData.get("redMonths") ? parseInt(formData.get("redMonths") as string) : null;

    await prisma.trainingCourse.update({
      where: { id },
      data: { name, description, isMandatory, validityMonths, amberMonths, redMonths },
    });
    redirect("/volunteers/training");
  }

  async function deleteCourse(formData: FormData) {
    "use server";
    await requireAuth();
    const id = formData.get("id") as string;
    await prisma.trainingCourse.delete({ where: { id } });
    redirect("/volunteers/training");
  }

  const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Courses</h1>
          <p className="text-gray-500 mt-1">Manage volunteer training courses and certifications</p>
        </div>
        <Link href="/volunteers/training/dept-training">
          <Button variant="outline" className="gap-1">
            <Building className="h-4 w-4" />
            Department Requirements
          </Button>
        </Link>
      </div>

      {/* Add new course */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Add Course</h2>
        </CardHeader>
        <CardContent>
          <form action={createCourse} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-3 items-end">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
                <input name="name" required placeholder="e.g. First Aid" className={inputClass} />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input name="description" placeholder="Optional" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Renewal (months)</label>
                <input name="validityMonths" type="number" placeholder="No expiry" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Amber</span>
                </label>
                <input name="amberMonths" type="number" defaultValue="3" min="1" placeholder="3" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Red</span>
                </label>
                <input name="redMonths" type="number" defaultValue="1" min="1" placeholder="1" className={inputClass} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input name="isMandatory" type="checkbox" className="rounded border-gray-300 h-4 w-4" />
                  <span className="text-sm font-medium text-gray-700">Mandatory</span>
                </label>
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-400">Leave renewal blank for courses that never expire. Amber and red thresholds only apply to courses with a renewal period.</p>
          </form>
        </CardContent>
      </Card>

      {/* Courses list — each row is an editable form */}
      {courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No training courses"
          description="Create your first training course to track volunteer certifications."
        />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Courses ({courses.length})</h2>
          </CardHeader>
          <CardContent className="space-y-0 divide-y divide-gray-100 p-0">
            {courses.map((course) => (
              <div key={course.id} className="group hover:bg-gray-50 transition-colors relative">
              <form action={updateCourse}>
                <input type="hidden" name="id" value={course.id} />
                <div className="grid grid-cols-12 gap-2 items-center px-4 py-3">
                  {/* Name - 3 cols */}
                  <div className="col-span-3">
                    <label className="sr-only">Name</label>
                    <input name="name" defaultValue={course.name} required className="w-full rounded border border-transparent group-hover:border-gray-300 px-2 py-1.5 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent" />
                  </div>
                  {/* Description - 3 cols */}
                  <div className="col-span-3">
                    <label className="sr-only">Description</label>
                    <input name="description" defaultValue={course.description || ""} placeholder="No description" className="w-full rounded border border-transparent group-hover:border-gray-300 px-2 py-1.5 text-sm text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent" />
                  </div>
                  {/* Mandatory - 1 col */}
                  <div className="col-span-1 flex justify-center">
                    <label className="flex items-center cursor-pointer" title="Mandatory">
                      <input name="isMandatory" type="checkbox" defaultChecked={course.isMandatory} className="rounded border-gray-300 h-4 w-4" />
                    </label>
                  </div>
                  {/* Validity - 1 col */}
                  <div className="col-span-1">
                    <label className="sr-only">Validity (months)</label>
                    <input name="validityMonths" type="number" defaultValue={course.validityMonths ?? ""} placeholder="—" title="Validity (months)" className="w-full rounded border border-transparent group-hover:border-gray-300 px-2 py-1.5 text-sm text-center text-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent" />
                  </div>
                  {/* Amber - 1 col */}
                  <div className="col-span-1">
                    <label className="sr-only">Amber (months)</label>
                    <input name="amberMonths" type="number" min="1" defaultValue={course.amberMonths ?? 3} title="Amber threshold (months)" className="w-full rounded border border-transparent group-hover:border-gray-300 px-2 py-1.5 text-sm text-center text-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent" />
                  </div>
                  {/* Red - 1 col */}
                  <div className="col-span-1">
                    <label className="sr-only">Red (months)</label>
                    <input name="redMonths" type="number" min="1" defaultValue={course.redMonths ?? 1} title="Red threshold (months)" className="w-full rounded border border-transparent group-hover:border-gray-300 px-2 py-1.5 text-sm text-center text-gray-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent" />
                  </div>
                  {/* Enrolled count - 1 col */}
                  <div className="col-span-1 text-center">
                    <span className="text-sm text-gray-500">{course._count.volunteerTrainings}</span>
                  </div>
                  {/* Actions - 1 col (always visible) */}
                  <div className="col-span-1 flex items-center justify-center gap-1">
                    <button type="submit" className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50 transition-colors" title="Save changes">
                      <Save className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </form>
              <form action={deleteCourse} className="absolute right-3 top-1/2 -translate-y-1/2">
                <input type="hidden" name="id" value={course.id} />
                <button type="submit" className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100" title="Delete course">
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
              </div>
            ))}
            {/* Column headers (sticky top) */}
          </CardContent>
          {/* Column legend */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div className="col-span-3">Name</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-1 text-center">Mand.</div>
            <div className="col-span-1 text-center">Validity</div>
            <div className="col-span-1 text-center"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Amb.</span></div>
            <div className="col-span-1 text-center"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Red</span></div>
            <div className="col-span-1 text-center">Enrolled</div>
            <div className="col-span-1 text-center">Actions</div>
          </div>
        </Card>
      )}

      {/* Coming Up for Renewal (RAG) */}
      {(redTrainings.length > 0 || amberTrainings.length > 0 || greenTrainings.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-semibold text-gray-900">Coming Up for Renewal</h2>
              <span className="text-sm text-gray-500 ml-2">Based on each course&apos;s RAG thresholds</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Red — Urgent", items: redTrainings, border: "border-l-red-500", text: "text-red-600", dot: "bg-red-500", badge: "bg-red-100 text-red-800" },
              { label: "Amber — Approaching", items: amberTrainings, border: "border-l-amber-400", text: "text-amber-600", dot: "bg-amber-400", badge: "bg-amber-100 text-amber-800" },
              { label: "Green — Upcoming", items: greenTrainings, border: "border-l-green-500", text: "text-green-600", dot: "bg-green-500", badge: "bg-green-100 text-green-800" },
            ].map((group) =>
              group.items.length > 0 && (
                <div key={group.label}>
                  <h3 className={`text-sm font-semibold ${group.text} mb-2 flex items-center gap-1.5`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${group.dot}`} />
                    {group.label} ({group.items.length})
                  </h3>
                  <div className={`border-l-4 ${group.border} bg-gray-50 rounded-r-lg overflow-hidden`}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Volunteer</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Course</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Completed</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Expiry</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-500">Days Left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((training) => (
                          <tr key={training.id} className="border-b border-gray-100 last:border-0">
                            <td className="px-4 py-2">
                              <Link href={`/crm/contacts/${training.volunteer.contactId}`} className="text-indigo-600 hover:underline font-medium">
                                {training.volunteer.contact.firstName} {training.volunteer.contact.lastName}
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-gray-700">{training.course.name}</td>
                            <td className="px-4 py-2 text-gray-500">{training.completedDate ? formatDate(training.completedDate) : "—"}</td>
                            <td className="px-4 py-2 text-gray-500">{training.expiryDate ? formatDate(training.expiryDate) : "—"}</td>
                            <td className="px-4 py-2">
                              {training.expiryDate && (
                                <Badge className={group.badge}>{daysUntilExpiry(training.expiryDate)}d</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Overdue */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Overdue Training</h2>
        </CardHeader>
        <CardContent>
          {overdueCourses.length === 0 ? (
            <p className="text-sm text-gray-500">No overdue training courses.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Volunteer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Course</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Expiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {overdueCourses.map((training) => (
                    <tr key={training.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/crm/contacts/${training.volunteer.contactId}`} className="text-indigo-600 hover:underline font-medium">
                          {training.volunteer.contact.firstName} {training.volunteer.contact.lastName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{training.course.name}</td>
                      <td className="px-4 py-3"><Badge variant="destructive">{training.status}</Badge></td>
                      <td className="px-4 py-3 text-gray-500">{training.expiryDate ? formatDate(training.expiryDate) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
