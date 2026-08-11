import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  ArrowLeft,
  MessageSquare,
  RefreshCw,
  UserCheck,
  Mail,
  Phone,
  Calendar,
  FileText,
  MoreHorizontal,
  Save,
  X,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-800",
  MEDIUM: "bg-blue-100 text-blue-800",
  HIGH: "bg-orange-100 text-orange-800",
  URGENT: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  AWAITING_INFO: "bg-purple-100 text-purple-800",
  ON_HOLD: "bg-purple-100 text-purple-800",
  RESOLVED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

const CATEGORY_OPTIONS = [
  "GENERAL",
  "SAFEGUARDING",
  "COMPLAINT",
  "WELFARE",
  "FINANCIAL",
  "HOUSING",
  "HEALTH",
  "LEGAL",
  "OTHER",
];

function getActivityIcon(type: string) {
  switch (type) {
    case "NOTE":
      return MessageSquare;
    case "STATUS_CHANGE":
      return RefreshCw;
    case "ASSIGNMENT":
      return UserCheck;
    case "EMAIL":
      return Mail;
    case "PHONE_CALL":
      return Phone;
    case "MEETING":
      return Calendar;
    case "DOCUMENT":
      return FileText;
    default:
      return MoreHorizontal;
  }
}

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireAuth();

  const { id } = await params;
  const { edit } = await searchParams;
  const isEditing = edit === "true";

  const caseRecord = await prisma.caseRecord.findUnique({
    where: { id },
    include: {
      contact: true,
      assignedTo: true,
      createdBy: true,
      activities: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!caseRecord) notFound();

  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "STAFF"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Build category options ensuring current value is included
  const categoryOptions = CATEGORY_OPTIONS.includes(caseRecord.category)
    ? CATEGORY_OPTIONS
    : [caseRecord.category, ...CATEGORY_OPTIONS];

  // Check if follow-up date is overdue
  const isOverdue =
    caseRecord.followUpDate &&
    new Date(caseRecord.followUpDate) < new Date() &&
    caseRecord.status !== "RESOLVED" &&
    caseRecord.status !== "CLOSED";

  // ── Server Actions ──────────────────────────────────────────────

  async function addNote(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const content = formData.get("content") as string;
    if (!content.trim()) return;

    await prisma.caseActivity.create({
      data: {
        caseId: id,
        type: "NOTE",
        description: content,
        createdById: session.id,
      },
    });

    revalidatePath(`/cases/${id}`);
  }

  async function changeStatus(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const current = await prisma.caseRecord.findUnique({ where: { id } });
    if (!current) return;

    const newStatus = formData.get("status") as string;
    const resolutionNotes = formData.get("resolutionNotes") as string;

    await prisma.caseRecord.update({
      where: { id },
      data: {
        status: newStatus,
        resolvedDate: newStatus === "RESOLVED" ? new Date() : null,
        closedDate: newStatus === "CLOSED" ? new Date() : null,
        resolutionNotes: resolutionNotes || null,
      },
    });

    await prisma.caseActivity.create({
      data: {
        caseId: id,
        type: "STATUS_CHANGE",
        description: `Status changed to ${newStatus.replace(/_/g, " ")}`,
        createdById: session.id,
      },
    });

    revalidatePath(`/cases/${id}`);
  }

  async function changeAssignment(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const assignedToId = formData.get("assignedToId") as string;

    const user = assignedToId
      ? await prisma.user.findUnique({ where: { id: assignedToId } })
      : null;

    await prisma.caseRecord.update({
      where: { id },
      data: {
        assignedToId: assignedToId || null,
      },
    });

    await prisma.caseActivity.create({
      data: {
        caseId: id,
        type: "ASSIGNMENT",
        description: `Assigned to ${user ? user.name : "Unassigned"}`,
        createdById: session.id,
      },
    });

    revalidatePath(`/cases/${id}`);
  }

  async function updateCasePriority(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const current = await prisma.caseRecord.findUnique({ where: { id } });
    if (!current) return;

    const newPriority = formData.get("priority") as string;
    if (newPriority === current.priority) return;

    await prisma.caseRecord.update({
      where: { id },
      data: { priority: newPriority },
    });

    await prisma.caseActivity.create({
      data: {
        caseId: id,
        type: "STATUS_CHANGE",
        description: `Priority changed from ${current.priority} to ${newPriority}`,
        createdById: session.id,
      },
    });

    revalidatePath(`/cases/${id}`);
  }

  async function updateCaseCategory(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const current = await prisma.caseRecord.findUnique({ where: { id } });
    if (!current) return;

    const newCategory = formData.get("category") as string;
    if (newCategory === current.category) return;

    await prisma.caseRecord.update({
      where: { id },
      data: { category: newCategory },
    });

    await prisma.caseActivity.create({
      data: {
        caseId: id,
        type: "STATUS_CHANGE",
        description: `Category changed from ${current.category} to ${newCategory}`,
        createdById: session.id,
      },
    });

    revalidatePath(`/cases/${id}`);
  }

  async function updateCaseDetails(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const current = await prisma.caseRecord.findUnique({ where: { id } });
    if (!current) return;

    const newTitle = (formData.get("title") as string).trim();
    const newDescription = (formData.get("description") as string).trim();

    if (!newTitle) return;

    const changes: string[] = [];
    if (newTitle !== current.title) changes.push("title");
    if (newDescription !== (current.description || "")) changes.push("description");

    if (changes.length === 0) {
      redirect(`/cases/${id}`);
      return;
    }

    await prisma.caseRecord.update({
      where: { id },
      data: {
        title: newTitle,
        description: newDescription || null,
      },
    });

    await prisma.caseActivity.create({
      data: {
        caseId: id,
        type: "NOTE",
        description: `Updated case ${changes.join(" and ")}`,
        createdById: session.id,
      },
    });

    revalidatePath(`/cases/${id}`);
    redirect(`/cases/${id}`);
  }

  async function updateFollowUpDate(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const current = await prisma.caseRecord.findUnique({ where: { id } });
    if (!current) return;

    const dateStr = formData.get("followUpDate") as string;
    const newDate = dateStr ? new Date(dateStr) : null;

    await prisma.caseRecord.update({
      where: { id },
      data: { followUpDate: newDate },
    });

    const dateDisplay = newDate
      ? newDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "none";

    await prisma.caseActivity.create({
      data: {
        caseId: id,
        type: "NOTE",
        description: `Follow-up date ${newDate ? "set to" : "cleared"} ${newDate ? dateDisplay : ""}`.trim(),
        createdById: session.id,
      },
    });

    revalidatePath(`/cases/${id}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/cases">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          {isEditing ? (
            <form action={updateCaseDetails} className="space-y-3">
              <Input
                name="title"
                defaultValue={caseRecord.title}
                className="text-2xl font-bold"
                placeholder="Case title"
                required
              />
              <Textarea
                name="description"
                defaultValue={caseRecord.description || ""}
                placeholder="Case description..."
                rows={4}
                className="rounded-lg"
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Link href={`/cases/${id}`}>
                  <Button type="button" variant="outline" size="sm">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">{caseRecord.title}</h1>
                <Link href={`/cases/${id}?edit=true`}>
                  <Button variant="outline" size="sm">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <p className="text-sm text-gray-500">
                Case {caseRecord.caseNumber} • Opened {formatDate(caseRecord.openedDate)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Overdue follow-up banner */}
      {isOverdue && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Follow-up overdue</p>
            <p className="text-xs text-red-600">
              Follow-up was due {formatDate(caseRecord.followUpDate!)}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description (only show when NOT editing, since edit mode is in header) */}
          {!isEditing && caseRecord.description && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-900">Description</h3>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">
                  {caseRecord.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Activity Timeline</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {caseRecord.activities.length === 0 ? (
                  <p className="text-sm text-gray-500">No activities yet</p>
                ) : (
                  <div className="relative space-y-6 pl-8">
                    {/* Timeline line */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-100" />

                    {caseRecord.activities.map((activity, idx) => {
                      const IconComponent = getActivityIcon(activity.type);
                      return (
                        <div key={activity.id} className="relative">
                          {/* Timeline dot */}
                          <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-white border-2 border-gray-300" />

                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3 flex-1">
                                <IconComponent className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">
                                    {activity.type.replace(/_/g, " ")}
                                  </p>
                                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">
                                    {activity.description}
                                  </p>
                                  <div className="flex gap-2 mt-2 text-xs text-gray-500">
                                    <span>{formatDate(activity.createdAt)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Add Note Form */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Add Note</h3>
            </CardHeader>
            <CardContent>
              <form action={addNote} className="space-y-3">
                <Textarea
                  name="content"
                  placeholder="Add a note about this case..."
                  className="rounded-lg"
                  rows={4}
                />
                <Button type="submit" size="sm">
                  Add Note
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900 text-sm">Status</h3>
            </CardHeader>
            <CardContent>
              <form action={changeStatus} className="space-y-3">
                <select
                  name="status"
                  defaultValue={caseRecord.status}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="AWAITING_INFO">Awaiting Info</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>

                {(caseRecord.status === "RESOLVED" || caseRecord.status === "CLOSED") && (
                  <Textarea
                    name="resolutionNotes"
                    placeholder="Resolution notes..."
                    defaultValue={caseRecord.resolutionNotes || ""}
                    rows={3}
                    className="rounded-lg"
                  />
                )}

                <Button type="submit" size="sm" className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  Update Status
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Priority Card — now editable */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900 text-sm">Priority</h3>
            </CardHeader>
            <CardContent>
              <form action={updateCasePriority} className="space-y-3">
                <select
                  name="priority"
                  defaultValue={caseRecord.priority}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <div className="flex items-center gap-2">
                  <Badge className={PRIORITY_COLORS[caseRecord.priority] || "bg-gray-100 text-gray-800"}>
                    {caseRecord.priority}
                  </Badge>
                  <span className="text-xs text-gray-500">current</span>
                </div>
                <Button type="submit" size="sm" className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  Update Priority
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Follow-up Date Card */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900 text-sm">Follow-up Date</h3>
            </CardHeader>
            <CardContent>
              <form action={updateFollowUpDate} className="space-y-3">
                <input
                  type="date"
                  name="followUpDate"
                  defaultValue={
                    caseRecord.followUpDate
                      ? new Date(caseRecord.followUpDate).toISOString().split("T")[0]
                      : ""
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {caseRecord.followUpDate && (
                  <div className="flex items-center gap-2">
                    {isOverdue ? (
                      <Badge className="bg-red-100 text-red-800">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Overdue
                      </Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800">
                        <Calendar className="h-3 w-3 mr-1" />
                        Scheduled
                      </Badge>
                    )}
                    <span className="text-xs text-gray-500">
                      {formatDate(caseRecord.followUpDate)}
                    </span>
                  </div>
                )}
                <Button type="submit" size="sm" className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  {caseRecord.followUpDate ? "Update" : "Set"} Follow-up
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Assignment Card */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900 text-sm">Assigned To</h3>
            </CardHeader>
            <CardContent>
              <form action={changeAssignment} className="space-y-3">
                <select
                  name="assignedToId"
                  defaultValue={caseRecord.assignedToId || ""}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  Update
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Card */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900 text-sm">Contact</h3>
            </CardHeader>
            <CardContent>
              <Link href={`/crm/contacts/${caseRecord.contactId}`} className="text-blue-600 hover:underline text-sm">
                {caseRecord.contact.firstName} {caseRecord.contact.lastName}
              </Link>
              {caseRecord.contact.email && (
                <p className="text-xs text-gray-500 mt-1">{caseRecord.contact.email}</p>
              )}
            </CardContent>
          </Card>

          {/* Category Card — now editable */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900 text-sm">Category</h3>
            </CardHeader>
            <CardContent>
              <form action={updateCaseCategory} className="space-y-3">
                <select
                  name="category"
                  defaultValue={caseRecord.category}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0) + cat.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  Update Category
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
