import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { UserCheck, Plus, Search, Shield, Car, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { getStatusColor } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function VolunteersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const statusFilter = params.status || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const where = {
    AND: [
      search
        ? {
            contact: {
              OR: [
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { email: { contains: search } },
              ],
            },
          }
        : {},
      statusFilter ? { status: statusFilter } : {},
    ],
  };

  const [volunteers, totalCount] = await Promise.all([
    prisma.volunteerProfile.findMany({
      where,
      include: {
        contact: true,
        departments: { include: { department: true } },
        skills: { include: { skill: true } },
        hoursLogs: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.volunteerProfile.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (statusFilter) paginationParams.status = statusFilter;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Volunteers</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} volunteers</p>
        </div>
        <Link href="/volunteers/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Volunteer
          </Button>
        </Link>
      </div>

      {/* Navigation links */}
      <div className="flex gap-2 flex-wrap">
        <Link href="/volunteers/dbs">
          <Button variant="outline">
            <Shield className="h-4 w-4 mr-2" />
            DBS Checks
          </Button>
        </Link>
        <Link href="/volunteers/licences">
          <Button variant="outline">
            <Car className="h-4 w-4 mr-2" />
            Licences
          </Button>
        </Link>
        <Link href="/volunteers/onboarding">
          <Button variant="outline">
            <ClipboardList className="h-4 w-4 mr-2" />
            Onboarding
          </Button>
        </Link>
      </div>

      <Card className="p-4">
        <form className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Search volunteers..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Status</option>
            <option value="APPLICANT">Applicant</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="DEPARTED">Departed</option>
          </select>
          <Button type="submit" variant="outline" size="sm">Filter</Button>
        </form>
      </Card>

      {volunteers.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No volunteers found"
          description="Start building your volunteer team."
          actionLabel="Add Volunteer"
          actionHref="/volunteers/new"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {volunteers.map((vol) => {
              const totalHours = vol.hoursLogs.reduce((sum, log) => sum + log.hours, 0);
              return (
                <Link key={vol.id} href={`/volunteers/${vol.id}`}>
                  <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-start gap-3">
                      <Avatar firstName={vol.contact.firstName} lastName={vol.contact.lastName} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {vol.contact.firstName} {vol.contact.lastName}
                          </h3>
                          <Badge className={getStatusColor(vol.status)}>{vol.status}</Badge>
                        </div>
                        {vol.contact.email && (
                          <p className="text-sm text-gray-500 truncate">{vol.contact.email}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {vol.skills.slice(0, 3).map((vs) => (
                            <Badge key={vs.id} variant="outline" className="text-xs">
                              {vs.skill.name}
                            </Badge>
                          ))}
                          {vol.skills.length > 3 && (
                            <Badge variant="secondary" className="text-xs">+{vol.skills.length - 3}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                          <span>{totalHours.toFixed(1)} hrs logged</span>
                          {vol.desiredHoursPerWeek && (
                            <span>{vol.desiredHoursPerWeek} hrs/week desired</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {vol.departments.map((vd) => (
                            <span key={vd.departmentId} className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                              {vd.department.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/volunteers"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </>
      )}
    </div>
  );
}
