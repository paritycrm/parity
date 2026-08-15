import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar, Wrench, Shield, Bell, Plus, X, Trash2, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getStatusColor, formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { logAudit } from "@/lib/audit";
import { startOnboarding } from "../onboarding/actions";

async function changeStatus(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;
  const newStatus = formData.get("status") as string;

  await prisma.volunteerProfile.update({
    where: { id: volunteerId },
    data: { status: newStatus },
  });
  await logAudit({ userId: session.id, action: "UPDATE", entityType: "Volunteer", entityId: volunteerId, details: { status: newStatus } });

  revalidatePath(`/volunteers/${volunteerId}`);
}

async function editBasicInfo(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;
  const desiredHoursPerWeek = formData.get("desiredHoursPerWeek") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const motivation = formData.get("motivation") as string;

  await prisma.volunteerProfile.update({
    where: { id: volunteerId },
    data: {
      desiredHoursPerWeek: desiredHoursPerWeek ? parseFloat(desiredHoursPerWeek) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      motivation: motivation || null,
    },
  });

  revalidatePath(`/volunteers/${volunteerId}`);
}

async function addSkill(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;
  const skillId = formData.get("skillId") as string;
  const proficiency = (formData.get("proficiency") as string) || "BEGINNER";

  await prisma.volunteerSkill.create({
    data: {
      volunteerId,
      skillId,
      proficiency,
    },
  });

  revalidatePath(`/volunteers/${volunteerId}`);
}

async function updateSkillProficiency(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerSkillId = formData.get("volunteerSkillId") as string;
  const volunteerId = formData.get("volunteerId") as string;
  const proficiency = formData.get("proficiency") as string;

  await prisma.volunteerSkill.update({
    where: { id: volunteerSkillId },
    data: { proficiency },
  });

  revalidatePath(`/volunteers/${volunteerId}`);
}

async function removeSkill(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;
  const skillId = formData.get("skillId") as string;

  await prisma.volunteerSkill.deleteMany({
    where: {
      volunteerId,
      skillId,
    },
  });

  revalidatePath(`/volunteers/${volunteerId}`);
}

async function addDepartment(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;
  const departmentId = formData.get("departmentId") as string;

  await prisma.volunteerDepartment.create({
    data: {
      volunteerId,
      departmentId,
    },
  });

  revalidatePath(`/volunteers/${volunteerId}`);
}

async function removeDepartment(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;
  const departmentId = formData.get("departmentId") as string;

  await prisma.volunteerDepartment.delete({
    where: {
      volunteerId_departmentId: {
        volunteerId,
        departmentId,
      },
    },
  });

  revalidatePath(`/volunteers/${volunteerId}`);
}

async function addSpecialConsideration(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;

  await prisma.specialConsideration.create({
    data: {
      volunteerId,
      category: formData.get("category") as string,
      description: formData.get("description") as string,
      accommodations: (formData.get("accommodations") as string) || null,
      isConfidential: formData.get("isConfidential") === "on",
    },
  });

  revalidatePath(`/volunteers/${volunteerId}`);
  redirect(`/volunteers/${volunteerId}`);
}

async function removeSpecialConsideration(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const scId = formData.get("scId") as string;
  const volunteerId = formData.get("volunteerId") as string;

  await prisma.specialConsideration.delete({
    where: { id: scId },
  });

  revalidatePath(`/volunteers/${volunteerId}`);
  redirect(`/volunteers/${volunteerId}`);
}

async function deleteVolunteer(formData: FormData) {
  "use server";
  const session = await getSession();
  if (!session) redirect("/login");

  const volunteerId = formData.get("volunteerId") as string;

  await prisma.volunteerProfile.delete({
    where: { id: volunteerId },
  });
  await logAudit({ userId: session.id, action: "DELETE", entityType: "Volunteer", entityId: volunteerId });

  redirect("/volunteers");
}

export default async function VolunteerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [volunteer, allSkills, allDepartments] = await Promise.all([
    prisma.volunteerProfile.findUnique({
      where: { id },
      include: {
        contact: true,
        departments: { include: { department: true } },
        skills: { include: { skill: true } },
        availability: true,
        specialConsiderations: true,
        hoursLogs: { include: { department: true }, orderBy: { date: "desc" }, take: 20 },
        activityRecords: { include: { department: true }, orderBy: { date: "desc" }, take: 20 },
        assignments: { include: { department: true }, orderBy: { date: "desc" }, take: 10 },
        reminders: { orderBy: { triggerDate: "desc" }, take: 10 },
        onboardingSteps: true,
      },
    }),
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  if (!volunteer) notFound();

  // Get skills and departments the volunteer doesn't have yet
  const volunteerSkillIds = volunteer.skills.map((vs) => vs.skillId);
  const availableSkills = allSkills.filter((s) => !volunteerSkillIds.includes(s.id));

  const volunteerDepartmentIds = volunteer.departments.map((vd) => vd.departmentId);
  const availableDepartments = allDepartments.filter((d) => !volunteerDepartmentIds.includes(d.id));

  const totalHours = volunteer.hoursLogs.reduce((sum, log) => sum + log.hours, 0);
  const verifiedHours = volunteer.hoursLogs
    .filter((log) => log.status === "VERIFIED")
    .reduce((sum, log) => sum + log.hours, 0);

  async function logHours(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const hours = parseFloat(formData.get("hours") as string);
    await prisma.volunteerHoursLog.create({
      data: {
        volunteerId: id,
        date: formData.get("date") as string,
        hours,
        description: (formData.get("description") as string) || null,
        departmentId: (formData.get("departmentId") as string) || null,
        status: "LOGGED",
      },
    });
    await logAudit({ userId: session.id, action: "CREATE", entityType: "VolunteerHours", entityId: id, details: { hours, date: formData.get("date") } });
    redirect(`/volunteers/${id}`);
  }

  const daysOfWeek = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const dayNames: Record<string, string> = {
    MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday",
    FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/volunteers" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Volunteer Profile</h1>
      </div>

      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar firstName={volunteer.contact.firstName} lastName={volunteer.contact.lastName} size="lg" />
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">
                  {volunteer.contact.firstName} {volunteer.contact.lastName}
                </h2>
                <form action={changeStatus} className="inline-flex items-center gap-2">
                  <input type="hidden" name="volunteerId" value={id} />
                  <AutoSubmitSelect
                    name="status"
                    defaultValue={volunteer.status}
                    options={[
                      { value: "APPLICANT", label: "APPLICANT" },
                      { value: "ACTIVE", label: "ACTIVE" },
                      { value: "INACTIVE", label: "INACTIVE" },
                      { value: "ON_LEAVE", label: "ON_LEAVE" },
                      { value: "DEPARTED", label: "DEPARTED" },
                    ]}
                  />
                </form>
                <Link href={`/crm/contacts/${volunteer.contactId}`}>
                  <Badge variant="outline" className="cursor-pointer hover:bg-gray-50">CRM Profile →</Badge>
                </Link>
                {volunteer.onboardingSteps.length > 0 ? (
                  <Link href="/volunteers/onboarding">
                    <Badge className="bg-indigo-100 text-indigo-800 cursor-pointer hover:bg-indigo-200">
                      <ClipboardList className="h-3 w-3 mr-1" />
                      View Onboarding →
                    </Badge>
                  </Link>
                ) : (
                  <form action={startOnboarding} className="inline">
                    <input type="hidden" name="volunteerId" value={id} />
                    <button type="submit" className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors">
                      <ClipboardList className="h-3 w-3" /> Start Onboarding
                    </button>
                  </form>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
                {volunteer.contact.email && <span>{volunteer.contact.email}</span>}
                {volunteer.contact.phone && <span>{volunteer.contact.phone}</span>}
                {volunteer.startDate && <span>Started: {volunteer.startDate}</span>}
                {volunteer.desiredHoursPerWeek && <span>{volunteer.desiredHoursPerWeek} hrs/week desired</span>}
              </div>
              {volunteer.motivation && <p className="text-sm text-gray-500 mt-1 italic">&ldquo;{volunteer.motivation}&rdquo;</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {volunteer.departments.map((vd) => (
                  <Badge key={vd.departmentId} variant="secondary">{vd.department.name}</Badge>
                ))}
              </div>
            </div>
            <div className="text-right space-y-2">
              <div>
                <p className="text-2xl font-bold text-indigo-600">{totalHours.toFixed(1)}</p>
                <p className="text-xs text-gray-500">total hours</p>
                <p className="text-sm font-medium text-green-600 mt-1">{verifiedHours.toFixed(1)} verified</p>
              </div>
              <Link href={`/volunteers/hours?volunteer=${id}`}>
                <Button size="sm" variant="outline" className="text-indigo-600 border-indigo-300 hover:bg-indigo-50">
                  <Clock className="h-3 w-3 mr-1" /> View All Hours
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Basic Info */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
        </CardHeader>
        <CardContent>
          <form action={editBasicInfo} className="space-y-4">
            <input type="hidden" name="volunteerId" value={id} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <Input
                  type="date"
                  name="startDate"
                  defaultValue={volunteer.startDate || ""}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <Input
                  type="date"
                  name="endDate"
                  defaultValue={volunteer.endDate || ""}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Desired Hours/Week</label>
                <Input
                  type="number"
                  step="0.5"
                  name="desiredHoursPerWeek"
                  defaultValue={volunteer.desiredHoursPerWeek || ""}
                  placeholder="e.g. 5"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivation</label>
              <textarea
                name="motivation"
                defaultValue={volunteer.motivation || ""}
                placeholder="Why does this volunteer want to help? What motivates them?"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <Button type="submit" size="sm">Save Changes</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Skills */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900">Skills</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {volunteer.skills.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No skills assigned</p>
            ) : (
              <div className="space-y-2 pb-4 border-b border-gray-100">
                {volunteer.skills.map((vs) => (
                  <div key={vs.id} className="flex items-center justify-between py-2">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900">{vs.skill.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={updateSkillProficiency} className="inline-flex items-center">
                        <input type="hidden" name="volunteerSkillId" value={vs.id} />
                        <input type="hidden" name="volunteerId" value={id} />
                        <AutoSubmitSelect
                          name="proficiency"
                          defaultValue={vs.proficiency}
                          options={[
                            { value: "BEGINNER", label: "Beginner" },
                            { value: "INTERMEDIATE", label: "Intermediate" },
                            { value: "SKILLED", label: "Skilled" },
                            { value: "EXPERT", label: "Expert" },
                          ]}
                          className="text-xs rounded-full px-2 py-0.5 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </form>
                      {vs.verifiedAt && <Badge className="bg-green-100 text-green-800 text-xs">Verified</Badge>}
                      <form action={removeSkill} className="inline">
                        <input type="hidden" name="volunteerId" value={id} />
                        <input type="hidden" name="skillId" value={vs.skillId} />
                        <button
                          type="submit"
                          className="text-gray-400 hover:text-red-500 transition"
                          title="Remove skill"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {availableSkills.length > 0 && (
              <form action={addSkill} className="flex items-end gap-2">
                <input type="hidden" name="volunteerId" value={id} />
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Add Skill</label>
                  <select name="skillId" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select a skill...</option>
                    {availableSkills.map((skill) => (
                      <option key={skill.id} value={skill.id}>{skill.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Proficiency</label>
                  <select name="proficiency" className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="SKILLED">Skilled</option>
                    <option value="EXPERT">Expert</option>
                  </select>
                </div>
                <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Availability */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900">Availability</h3>
            </div>
          </CardHeader>
          <CardContent>
            {volunteer.availability.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No availability set</p>
            ) : (
              <div className="space-y-2">
                {daysOfWeek.map((day) => {
                  const slots = volunteer.availability.filter((a) => a.dayOfWeek === day);
                  if (slots.length === 0) return null;
                  return (
                    <div key={day} className="flex items-center gap-3 py-1">
                      <span className="text-sm font-medium text-gray-700 w-24">{dayNames[day]}</span>
                      <div className="flex gap-2 flex-wrap">
                        {slots.map((slot) => (
                          <span key={slot.id} className="text-sm text-gray-500 bg-indigo-50 px-2 py-0.5 rounded">
                            {slot.startTime} - {slot.endTime}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Departments */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900">Departments</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {volunteer.departments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Not assigned to any departments</p>
            ) : (
              <div className="space-y-2 pb-4 border-b border-gray-100">
                {volunteer.departments.map((vd) => (
                  <div key={vd.departmentId} className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium text-gray-900">{vd.department.name}</span>
                    <form action={removeDepartment} className="inline">
                      <input type="hidden" name="volunteerId" value={id} />
                      <input type="hidden" name="departmentId" value={vd.departmentId} />
                      <button
                        type="submit"
                        className="text-gray-400 hover:text-red-500 transition"
                        title="Remove department"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
            {availableDepartments.length > 0 && (
              <form action={addDepartment} className="flex items-end gap-2">
                <input type="hidden" name="volunteerId" value={id} />
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Add Department</label>
                  <select name="departmentId" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select a department...</option>
                    {availableDepartments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Hours Log */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900">Hours Log</h3>
              </div>
              <Link href={`/volunteers/hours?volunteer=${id}`} className="text-sm text-indigo-600 hover:underline">
                View All →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <form action={logHours} className="space-y-3 mb-6 pb-6 border-b border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <Input name="date" type="date" required label="Date" />
                <Input name="hours" type="number" step="0.25" required label="Hours" placeholder="e.g. 4" />
              </div>
              <Input name="description" placeholder="What did they do?" />
              <select name="departmentId" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Department (optional)</option>
                {volunteer.departments.map((vd) => (
                  <option key={vd.departmentId} value={vd.departmentId}>{vd.department.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm"><Plus className="h-4 w-4 mr-1" /> Log Hours</Button>
            </form>
            <div className="space-y-2">
              {volunteer.hoursLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{log.hours} hours</p>
                    {log.description && <p className="text-xs text-gray-500">{log.description}</p>}
                    <p className="text-xs text-gray-400">{log.date} {log.department && `• ${log.department.name}`}</p>
                  </div>
                  <Badge className={getStatusColor(log.status)}>{log.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Assignments */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900">Assignments</h3>
              </div>
              <Link href="/assignments" className="text-sm text-indigo-600 hover:underline">
                View All →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {volunteer.assignments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No assignments</p>
            ) : (
              <div className="space-y-2">
                {volunteer.assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.title}</p>
                      <p className="text-xs text-gray-500">{a.date} • {a.startTime}-{a.endTime} • {a.department.name}</p>
                    </div>
                    <Badge className={getStatusColor(a.status)}>{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Special Considerations */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900">Special Considerations</h3>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {volunteer.specialConsiderations.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">None recorded</p>
            ) : (
              <div className="space-y-3 pb-4 border-b border-gray-100">
                {volunteer.specialConsiderations.map((sc) => (
                  <div key={sc.id} className="p-3 bg-yellow-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{sc.category}</Badge>
                        {sc.isConfidential && <Badge className="bg-red-100 text-red-800 text-xs">Confidential</Badge>}
                      </div>
                      <form action={removeSpecialConsideration} className="inline">
                        <input type="hidden" name="scId" value={sc.id} />
                        <input type="hidden" name="volunteerId" value={id} />
                        <button type="submit" className="text-gray-400 hover:text-red-500 transition" title="Remove">
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                    <p className="text-sm text-gray-700">{sc.description}</p>
                    {sc.accommodations && (
                      <p className="text-sm text-gray-500 mt-1">Accommodations: {sc.accommodations}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <form action={addSpecialConsideration} className="space-y-3">
              <input type="hidden" name="volunteerId" value={id} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select name="category" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select category...</option>
                  <option value="MEDICAL">Medical</option>
                  <option value="DISABILITY">Disability</option>
                  <option value="DIETARY">Dietary</option>
                  <option value="ALLERGY">Allergy</option>
                  <option value="MOBILITY">Mobility</option>
                  <option value="MENTAL_HEALTH">Mental Health</option>
                  <option value="RELIGIOUS">Religious</option>
                  <option value="LANGUAGE">Language</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Textarea name="description" required placeholder="Describe the consideration..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accommodations (optional)</label>
                <Input name="accommodations" placeholder="What accommodations are needed?" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="isConfidential"
                  defaultChecked={true}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                Mark as confidential
              </label>
              <Button type="submit" size="sm"><Plus className="h-4 w-4 mr-1" /> Add Consideration</Button>
            </form>
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
            </div>
          </CardHeader>
          <CardContent>
            {volunteer.activityRecords.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No activities recorded</p>
            ) : (
              <div className="space-y-3">
                {volunteer.activityRecords.map((ar) => (
                  <div key={ar.id} className="flex items-start gap-3 py-2">
                    <div className="mt-1 h-2 w-2 rounded-full bg-indigo-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ar.title}</p>
                      {ar.description && <p className="text-xs text-gray-500">{ar.description}</p>}
                      <p className="text-xs text-gray-400">
                        {formatDate(ar.date)} • {ar.type}
                        {ar.department && ` • ${ar.department.name}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Volunteer */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <h3 className="text-lg font-semibold text-red-900">Danger Zone</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-700 mb-4">
            Permanently delete this volunteer profile. This action cannot be undone. The associated contact will remain.
          </p>
          <form action={deleteVolunteer}>
            <input type="hidden" name="volunteerId" value={id} />
            <ConfirmButton message="Are you sure you want to delete this volunteer profile? This action cannot be undone." variant="destructive" size="sm" className="bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Volunteer Profile
            </ConfirmButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
