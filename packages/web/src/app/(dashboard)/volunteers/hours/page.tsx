import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Clock, Trash2, Plus, Search } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatusColor, formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Pagination } from "@/components/ui/pagination";
import { logAudit } from "@/lib/audit";

const PAGE_SIZE = 100;

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ volunteer?: string; department?: string; status?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const filters = await searchParams;
  const currentPage = Math.max(1, parseInt(filters.page || "1", 10) || 1);

  // Build where clause for filtering
  const where: Record<string, unknown> = {};
  if (filters.volunteer) {
    where.volunteerId = filters.volunteer;
  }
  if (filters.department) {
    where.departmentId = filters.department;
  }
  if (filters.status) {
    where.status = filters.status;
  }

  const [hoursLogs, totalCount, volunteers, departments] = await Promise.all([
    prisma.volunteerHoursLog.findMany({
      where,
      include: {
        volunteer: { include: { contact: true } },
        department: true,
        verifiedBy: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.volunteerHoursLog.count({ where }),
    prisma.volunteerProfile.findMany({
      where: { status: { not: "DEPARTED" } },
      include: { contact: true },
      orderBy: { contact: { firstName: "asc" } },
    }),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (filters.volunteer) paginationParams.volunteer = filters.volunteer;
  if (filters.department) paginationParams.department = filters.department;
  if (filters.status) paginationParams.status = filters.status;

  const pendingCount = hoursLogs.filter((h) => h.status === "LOGGED" || h.status === "APPROVED").length;
  const totalHoursShown = hoursLogs.reduce((sum, h) => sum + h.hours, 0);

  async function quickLogHours(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");

    const volunteerId = formData.get("volunteerId") as string;
    if (!volunteerId) return;

    const hours = parseFloat(formData.get("hours") as string);
    await prisma.volunteerHoursLog.create({
      data: {
        volunteerId,
        date: formData.get("date") as string,
        hours,
        description: (formData.get("description") as string) || null,
        departmentId: (formData.get("departmentId") as string) || null,
        status: "LOGGED",
      },
    });
    await logAudit({ userId: s.id, action: "CREATE", entityType: "VolunteerHours", entityId: volunteerId, details: { hours, date: formData.get("date") } });
    revalidatePath("/volunteers/hours");
    redirect("/volunteers/hours");
  }

  async function verifyHours(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");
    const logId = formData.get("logId") as string;
    await prisma.volunteerHoursLog.update({
      where: { id: logId },
      data: { status: "VERIFIED", verifiedById: s.id },
    });
    await logAudit({ userId: s.id, action: "UPDATE", entityType: "VolunteerHours", entityId: logId, details: { status: "VERIFIED" } });
    revalidatePath("/volunteers/hours");
  }

  async function deleteHours(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s) redirect("/login");
    const logId = formData.get("logId") as string;
    await prisma.volunteerHoursLog.delete({
      where: { id: logId },
    });
    revalidatePath("/volunteers/hours");
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Volunteer Hours</h1>
          <p className="text-gray-500 mt-1">
            {totalCount.toLocaleString()} hour logs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold text-indigo-600">{totalHoursShown.toFixed(1)}</p>
            <p className="text-xs text-gray-500">hours shown</p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 text-sm px-3 py-1">
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </div>

      {/* Quick Log Hours - the main action */}
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">Quick Log Hours</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Record volunteer hours — select a volunteer, how many hours, and what they did.
          </p>
        </CardHeader>
        <CardContent>
          <form action={quickLogHours} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Volunteer</label>
                <SearchableSelect
                  name="volunteerId"
                  required
                  placeholder="Search volunteers..."
                  options={volunteers.map((v) => ({
                    value: v.id,
                    label: `${v.contact.firstName} ${v.contact.lastName}`,
                  }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <SearchableSelect
                  name="departmentId"
                  placeholder="Select department (optional)"
                  options={departments.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <Input name="date" type="date" required defaultValue={today} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                <Input name="hours" type="number" step="0.25" min="0.25" required placeholder="e.g. 5" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">What did they do?</label>
                <Input name="description" placeholder="e.g. Kitchen prep and serving" />
              </div>
            </div>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="h-4 w-4 mr-2" /> Log Hours
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <form className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Filter by Volunteer</label>
              <SearchableSelect
                name="volunteer"
                placeholder="All volunteers"
                defaultValue={filters.volunteer || ""}
                options={volunteers.map((v) => ({
                  value: v.id,
                  label: `${v.contact.firstName} ${v.contact.lastName}`,
                }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
              <select
                name="department"
                defaultValue={filters.department || ""}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                name="status"
                defaultValue={filters.status || ""}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="LOGGED">Logged (Pending)</option>
                <option value="APPROVED">Approved (Pending Verification)</option>
                <option value="VERIFIED">Verified</option>
              </select>
            </div>
            <Button type="submit" variant="outline" size="sm">
              <Search className="h-4 w-4 mr-1" /> Filter
            </Button>
            {(filters.volunteer || filters.department || filters.status) && (
              <Link href="/volunteers/hours">
                <Button variant="ghost" size="sm" className="text-gray-500">Clear</Button>
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Hours Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volunteer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {hoursLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    No hours logged yet. Use the form above to get started.
                  </td>
                </tr>
              ) : (
                hoursLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/volunteers/${log.volunteerId}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        {log.volunteer.contact.firstName} {log.volunteer.contact.lastName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{log.date}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{log.hours}h</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{log.department?.name || "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{log.description || "—"}</td>
                    <td className="px-6 py-4">
                      <Badge className={getStatusColor(log.status)}>{log.status}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {(log.status === "LOGGED" || log.status === "APPROVED") && (
                          <form action={verifyHours} className="inline">
                            <input type="hidden" name="logId" value={log.id} />
                            <Button type="submit" size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50">
                              Verify
                            </Button>
                          </form>
                        )}
                        <form action={deleteHours} className="inline">
                          <input type="hidden" name="logId" value={log.id} />
                          <ConfirmButton message="Are you sure you want to delete this hours log?" variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </ConfirmButton>
                        </form>
                        {log.verifiedBy && (
                          <span className="text-xs text-gray-400">by {log.verifiedBy.name}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          baseUrl="/volunteers/hours"
          totalItems={totalCount}
          pageSize={PAGE_SIZE}
          searchParams={paginationParams}
        />
      </Card>
    </div>
  );
}
