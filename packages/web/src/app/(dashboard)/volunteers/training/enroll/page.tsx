import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { GraduationCap, ArrowLeft, Users } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function TrainingEnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const selectedCourseId = params.courseId || "";

  const [courses, activeVolunteers] = await Promise.all([
    prisma.trainingCourse.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.volunteerProfile.findMany({
      where: { status: "ACTIVE" },
      include: {
        contact: true,
        trainings: true,
      },
      orderBy: { contact: { firstName: "asc" } },
    }),
  ]);

  // Get existing enrollments for the selected course
  const existingEnrollments = selectedCourseId
    ? await prisma.volunteerTraining.findMany({
        where: { courseId: selectedCourseId },
        select: { volunteerId: true, status: true },
      })
    : [];

  const enrollmentMap = new Map(
    existingEnrollments.map((e) => [e.volunteerId, e.status])
  );

  async function enrollVolunteers(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");

    const courseId = formData.get("courseId") as string;
    if (!courseId) return;

    const volunteerIds = formData.getAll("volunteerIds") as string[];
    if (volunteerIds.length === 0) return;

    // Only enroll volunteers who aren't already enrolled
    const existing = await prisma.volunteerTraining.findMany({
      where: {
        courseId,
        volunteerId: { in: volunteerIds },
      },
      select: { volunteerId: true },
    });

    const alreadyEnrolled = new Set(existing.map((e) => e.volunteerId));
    const toEnroll = volunteerIds.filter((id) => !alreadyEnrolled.has(id));

    if (toEnroll.length > 0) {
      await prisma.volunteerTraining.createMany({
        data: toEnroll.map((volunteerId) => ({
          volunteerId,
          courseId,
          status: "NOT_STARTED",
        })),
      });
    }

    revalidatePath("/volunteers/training/enroll");
    redirect(`/volunteers/training/${courseId}`);
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/volunteers"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Volunteers
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Enroll in Training</h1>
          <p className="text-gray-500 mt-1">
            Select a training course and enroll active volunteers.
          </p>
        </div>
      </div>

      {/* Course Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Select Course</h2>
          </div>
        </CardHeader>
        <CardContent>
          <form className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Training Course
              </label>
              <select
                name="courseId"
                defaultValue={selectedCourseId}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">-- Select a course --</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                    {course.isMandatory ? " (Mandatory)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline">
              Load Volunteers
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Volunteer Selection */}
      {selectedCourseId && selectedCourse && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Volunteers for: {selectedCourse.name}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {selectedCourse.isMandatory && (
                  <Badge className="bg-red-100 text-red-800">Mandatory</Badge>
                )}
                {selectedCourse.validityMonths && (
                  <Badge variant="outline">
                    Valid for {selectedCourse.validityMonths} months
                  </Badge>
                )}
              </div>
            </div>
            {selectedCourse.description && (
              <p className="text-sm text-gray-500 mt-1">
                {selectedCourse.description}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <form action={enrollVolunteers}>
              <input type="hidden" name="courseId" value={selectedCourseId} />

              {activeVolunteers.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">
                  No active volunteers found.
                </p>
              ) : (
                <>
                  <div className="mb-4 text-sm text-gray-500">
                    {activeVolunteers.length} active volunteer
                    {activeVolunteers.length !== 1 ? "s" : ""}
                    {" | "}
                    {enrollmentMap.size} already enrolled
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {activeVolunteers.map((vol) => {
                      const currentStatus = enrollmentMap.get(vol.id);
                      const isEnrolled = !!currentStatus;

                      return (
                        <label
                          key={vol.id}
                          className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            name="volunteerIds"
                            value={vol.id}
                            defaultChecked={isEnrolled}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-900">
                            {vol.contact.firstName} {vol.contact.lastName}
                          </span>
                          {currentStatus && (
                            <Badge
                              variant="outline"
                              className={
                                currentStatus === "COMPLETED"
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : currentStatus === "IN_PROGRESS"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : currentStatus === "EXPIRED"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-gray-50 text-gray-700 border-gray-200"
                              }
                            >
                              {currentStatus.replace("_", " ")}
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                      Enroll Selected
                    </Button>
                    <Link href={`/volunteers/training/${selectedCourseId}`}>
                      <Button type="button" variant="outline">
                        View Course Detail
                      </Button>
                    </Link>
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      {courses.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">All Training Courses</h3>
          <div className="flex flex-wrap gap-2">
            {courses.map((course) => (
              <Link key={course.id} href={`/volunteers/training/${course.id}`}>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-gray-100 px-3 py-1"
                >
                  {course.name}
                  {course.isMandatory && " *"}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
