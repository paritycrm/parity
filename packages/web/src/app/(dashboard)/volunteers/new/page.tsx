import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function NewVolunteerPage() {
  const [departments, skills] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
  ]);

  async function createVolunteer(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const contact = await prisma.contact.create({
      data: {
        firstName: formData.get("firstName") as string,
        lastName: formData.get("lastName") as string,
        email: (formData.get("email") as string) || null,
        phone: (formData.get("phone") as string) || null,
        type: "VOLUNTEER",
        types: ["VOLUNTEER"],
        createdById: session.id,
      },
    });

    const deptIds = formData.getAll("departments") as string[];
    const skillIds = formData.getAll("skills") as string[];
    const desiredHours = formData.get("desiredHoursPerWeek") as string;

    const startOnboarding = formData.get("startOnboarding") === "on";

    const volunteer = await prisma.volunteerProfile.create({
      data: {
        contactId: contact.id,
        status: startOnboarding ? "APPLICANT" : "ACTIVE",
        startDate: startOnboarding ? null : new Date().toISOString().split("T")[0],
        desiredHoursPerWeek: desiredHours ? parseFloat(desiredHours) : null,
        departments: {
          create: deptIds.map((id) => ({ departmentId: id })),
        },
        skills: {
          create: skillIds.map((id) => ({ skillId: id })),
        },
      },
    });

    // Auto-assign mandatory training for selected departments
    if (deptIds.length > 0) {
      const deptTrainings = await prisma.departmentTraining.findMany({
        where: { departmentId: { in: deptIds } },
        select: { courseId: true },
      });
      const uniqueCourseIds = [...new Set(deptTrainings.map(dt => dt.courseId))];
      if (uniqueCourseIds.length > 0) {
        // Check which trainings already exist (shouldn't be any for a new volunteer, but safe)
        const existingTrainings = await prisma.volunteerTraining.findMany({
          where: {
            volunteerId: volunteer.id,
            courseId: { in: uniqueCourseIds },
          },
          select: { courseId: true },
        });
        const existingCourseIds = new Set(existingTrainings.map(t => t.courseId));
        const newCourseIds = uniqueCourseIds.filter(id => !existingCourseIds.has(id));
        if (newCourseIds.length > 0) {
          await prisma.volunteerTraining.createMany({
            data: newCourseIds.map(courseId => ({
              volunteerId: volunteer.id,
              courseId,
              status: "NOT_STARTED",
            })),
          });
        }
      }
    }

    // Auto-start onboarding workflow if requested
    if (startOnboarding) {
      const ONBOARDING_STEPS = [
        "APPLICATION_RECEIVED",
        "DBS_SUBMITTED",
        "DBS_CLEARED",
        "INDUCTION",
        "TRAINING_ASSIGNED",
        "TRAINING_COMPLETED",
        "FULLY_ONBOARDED",
      ];
      await prisma.$transaction(
        ONBOARDING_STEPS.map((stepName) =>
          prisma.onboardingStep.create({
            data: {
              volunteerId: volunteer.id,
              stepName,
              completedAt: stepName === "APPLICATION_RECEIVED" ? new Date() : null,
              completedById: stepName === "APPLICATION_RECEIVED" ? session.id : null,
            },
          })
        )
      );
    }

    redirect(startOnboarding ? "/volunteers/onboarding" : `/crm/contacts/${contact.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/volunteers" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add Volunteer</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={createVolunteer} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" required />
              <Input label="Last Name" name="lastName" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Email" name="email" type="email" />
              <Input label="Phone" name="phone" type="tel" />
            </div>
            <Input
              label="Desired Hours per Week"
              name="desiredHoursPerWeek"
              type="number"
              step="0.5"
              placeholder="e.g. 8"
            />

            {departments.length > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Departments</label>
                <div className="grid grid-cols-2 gap-2">
                  {departments.map((dept) => (
                    <label key={dept.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="departments" value={dept.id} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      {dept.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {skills.length > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Skills</label>
                <div className="grid grid-cols-2 gap-2">
                  {skills.map((skill) => (
                    <label key={skill.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="skills" value={skill.id} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      {skill.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="startOnboarding"
                  defaultChecked
                  className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <p className="text-sm font-medium text-indigo-800">Start Onboarding Workflow</p>
                  <p className="text-xs text-indigo-600 mt-0.5">
                    Creates the volunteer as an Applicant and starts the 7-step onboarding process (DBS, induction, training, etc.). Uncheck to add them as Active immediately.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <Link href="/volunteers">
                <Button variant="outline" type="button">Cancel</Button>
              </Link>
              <Button type="submit">Create Volunteer</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
