import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  GraduationCap,
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { formatDate } from "@/lib/utils";

export default async function TrainingCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    include: {
      volunteerTrainings: {
        include: {
          volunteer: { include: { contact: true } },
          verifiedBy: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!course) notFound();

  // Get volunteers not yet enrolled for the inline enroll form
  const enrolledVolunteerIds = course.volunteerTrainings.map((vt) => vt.volunteerId);
  const availableVolunteers = await prisma.volunteerProfile.findMany({
    where: {
      status: "ACTIVE",
      id: { notIn: enrolledVolunteerIds.length > 0 ? enrolledVolunteerIds : ["__none__"] },
    },
    include: { contact: true },
    orderBy: { contact: { firstName: "asc" } },
  });

  // --- Server Actions ---

  async function enrollVolunteer(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");

    const courseId = formData.get("courseId") as string;
    const volunteerId = formData.get("volunteerId") as string;
    if (!courseId || !volunteerId) return;

    // Check not already enrolled
    const existing = await prisma.volunteerTraining.findUnique({
      where: { volunteerId_courseId: { volunteerId, courseId } },
    });
    if (existing) return;

    await prisma.volunteerTraining.create({
      data: {
        volunteerId,
        courseId,
        status: "NOT_STARTED",
      },
    });

    revalidatePath(`/volunteers/training/${courseId}`);
  }

  async function updateTrainingStatus(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");

    const trainingId = formData.get("trainingId") as string;
    const newStatus = formData.get("status") as string;
    const courseId = formData.get("courseId") as string;

    if (!trainingId || !newStatus) return;

    const training = await prisma.volunteerTraining.findUnique({
      where: { id: trainingId },
      include: { course: true },
    });
    if (!training) return;

    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === "COMPLETED") {
      const now = new Date();
      updateData.completedDate = now;
      updateData.verifiedById = s.id;

      if (training.course.validityMonths) {
        const expiry = new Date(now);
        expiry.setMonth(expiry.getMonth() + training.course.validityMonths);
        updateData.expiryDate = expiry;
      }
    }

    if (newStatus === "EXPIRED") {
      // Keep completedDate as is, just update status
    }

    if (newStatus === "IN_PROGRESS") {
      // Clear completion data when moving back to in-progress
      updateData.completedDate = null;
      updateData.expiryDate = null;
      updateData.verifiedById = null;
    }

    await prisma.volunteerTraining.update({
      where: { id: trainingId },
      data: updateData,
    });

    revalidatePath(`/volunteers/training/${courseId}`);
  }

  async function removeEnrollment(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");

    const trainingId = formData.get("trainingId") as string;
    const courseId = formData.get("courseId") as string;
    if (!trainingId) return;

    await prisma.volunteerTraining.delete({
      where: { id: trainingId },
    });

    revalidatePath(`/volunteers/training/${courseId}`);
  }

  // Status counts
  const statusCounts = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    EXPIRED: 0,
  };
  for (const vt of course.volunteerTrainings) {
    if (vt.status in statusCounts) {
      statusCounts[vt.status as keyof typeof statusCounts]++;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/volunteers/training/enroll"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Training Enrollment
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-7 w-7 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
              {course.description && (
                <p className="text-gray-500 mt-1">{course.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {course.isMandatory && (
              <Badge className="bg-red-100 text-red-800">Mandatory</Badge>
            )}
            {course.validityMonths ? (
              <Badge variant="outline">
                Valid for {course.validityMonths} month
                {course.validityMonths !== 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Never expires
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-gray-400">{statusCounts.NOT_STARTED}</p>
          <p className="text-xs text-gray-500 mt-1">Not Started</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{statusCounts.IN_PROGRESS}</p>
          <p className="text-xs text-gray-500 mt-1">In Progress</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{statusCounts.COMPLETED}</p>
          <p className="text-xs text-gray-500 mt-1">Completed</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{statusCounts.EXPIRED}</p>
          <p className="text-xs text-gray-500 mt-1">Expired</p>
        </Card>
      </div>

      {/* Enroll New Volunteer */}
      {availableVolunteers.length > 0 && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Enroll Volunteer</h3>
            </div>
          </CardHeader>
          <CardContent>
            <form action={enrollVolunteer} className="flex items-end gap-3">
              <input type="hidden" name="courseId" value={course.id} />
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Volunteer
                </label>
                <select
                  name="volunteerId"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">-- Select a volunteer --</option>
                  {availableVolunteers.map((vol) => (
                    <option key={vol.id} value={vol.id}>
                      {vol.contact.firstName} {vol.contact.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="h-4 w-4 mr-2" />
                Enroll
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Enrolled Volunteers Table */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Enrolled Volunteers ({course.volunteerTrainings.length})
          </h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Volunteer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Expires
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Verified By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {course.volunteerTrainings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    No volunteers enrolled yet. Use the form above to enroll volunteers.
                  </td>
                </tr>
              ) : (
                course.volunteerTrainings.map((vt) => (
                  <tr key={vt.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/crm/contacts/${vt.volunteer.contactId}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        {vt.volunteer.contact.firstName} {vt.volunteer.contact.lastName}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        className={
                          vt.status === "COMPLETED"
                            ? "bg-green-100 text-green-800"
                            : vt.status === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-800"
                            : vt.status === "EXPIRED"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                        }
                      >
                        {vt.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {vt.completedDate ? formatDate(vt.completedDate) : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {vt.expiryDate ? (
                        <span
                          className={
                            new Date(vt.expiryDate) < new Date()
                              ? "text-red-600 font-medium"
                              : ""
                          }
                        >
                          {formatDate(vt.expiryDate)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {vt.verifiedBy?.name || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        {vt.status === "NOT_STARTED" && (
                          <form action={updateTrainingStatus} className="inline">
                            <input type="hidden" name="trainingId" value={vt.id} />
                            <input type="hidden" name="courseId" value={course.id} />
                            <input type="hidden" name="status" value="IN_PROGRESS" />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="text-blue-700 border-blue-300 hover:bg-blue-50"
                            >
                              <Clock className="h-3.5 w-3.5 mr-1" />
                              In Progress
                            </Button>
                          </form>
                        )}

                        {(vt.status === "NOT_STARTED" || vt.status === "IN_PROGRESS") && (
                          <form action={updateTrainingStatus} className="inline">
                            <input type="hidden" name="trainingId" value={vt.id} />
                            <input type="hidden" name="courseId" value={course.id} />
                            <input type="hidden" name="status" value="COMPLETED" />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="text-green-700 border-green-300 hover:bg-green-50"
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                              Complete
                            </Button>
                          </form>
                        )}

                        {vt.status === "COMPLETED" && (
                          <form action={updateTrainingStatus} className="inline">
                            <input type="hidden" name="trainingId" value={vt.id} />
                            <input type="hidden" name="courseId" value={course.id} />
                            <input type="hidden" name="status" value="EXPIRED" />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              className="text-orange-700 border-orange-300 hover:bg-orange-50"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                              Expire
                            </Button>
                          </form>
                        )}

                        <form action={removeEnrollment} className="inline">
                          <input type="hidden" name="trainingId" value={vt.id} />
                          <input type="hidden" name="courseId" value={course.id} />
                          <ConfirmButton
                            message="Remove this volunteer from the training course?"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </ConfirmButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
