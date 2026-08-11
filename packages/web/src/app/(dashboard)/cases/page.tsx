import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import { Plus, AlertCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 100;

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

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  await requireAuth();

  const params = await searchParams;
  const statusFilter = params.status || "";
  const search = params.search || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const searchFilter = search
    ? {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { caseNumber: { contains: search, mode: "insensitive" as const } },
          {
            contact: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" as const } },
                { lastName: { contains: search, mode: "insensitive" as const } },
              ],
            },
          },
        ],
      }
    : {};

  // Fetch stats
  const [openCount, inProgressCount, urgentCount, resolvedThisMonth] = await Promise.all([
    prisma.caseRecord.count({ where: { status: "OPEN" } }),
    prisma.caseRecord.count({ where: { status: "IN_PROGRESS" } }),
    prisma.caseRecord.count({ where: { priority: "URGENT" } }),
    prisma.caseRecord.count({
      where: {
        status: "RESOLVED",
        resolvedDate: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ]);

  // Fetch cases with optional status filter
  const where = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...searchFilter,
  };

  const [cases, totalCount] = await Promise.all([
    prisma.caseRecord.findMany({
      where,
      include: {
        contact: true,
        assignedTo: true,
      },
      orderBy: { openedDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.caseRecord.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (statusFilter) paginationParams.status = statusFilter;
  if (search) paginationParams.search = search;

  const statuses = ["OPEN", "IN_PROGRESS", "AWAITING_INFO", "ON_HOLD", "RESOLVED", "CLOSED"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Case Management</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} cases</p>
        </div>
        <Link href="/cases/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Case
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{openCount}</p>
              <p className="text-sm text-gray-500 mt-1">Open Cases</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-600">{inProgressCount}</p>
              <p className="text-sm text-gray-500 mt-1">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-red-600">{urgentCount}</p>
              <p className="text-sm text-gray-500 mt-1">Urgent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{resolvedThisMonth}</p>
              <p className="text-sm text-gray-500 mt-1">Resolved This Month</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <form className="flex gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                name="search"
                type="text"
                defaultValue={search}
                placeholder="Search cases by title, case number, or contact name..."
                className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
              />
            </div>
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Status Tabs */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 flex-wrap">
            <Link href={`/cases${search ? `?search=${encodeURIComponent(search)}` : ""}`}>
              <Button
                variant={statusFilter === "" ? "default" : "outline"}
                size="sm"
              >
                All
              </Button>
            </Link>
            {statuses.map((status) => (
              <Link key={status} href={`/cases?status=${status}${search ? `&search=${encodeURIComponent(search)}` : ""}`}>
                <Button
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                >
                  {status.replace(/_/g, " ")}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cases Table */}
      {cases.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No cases found"
          description={statusFilter ? `No ${statusFilter.toLowerCase()} cases at the moment.` : "Get started by creating your first case."}
          actionLabel="Create Case"
          actionHref="/cases/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Case #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opened
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {cases.map((caseRecord) => (
                  <tr key={caseRecord.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/cases/${caseRecord.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {caseRecord.caseNumber.substring(0, 8)}
                      </Link>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <Link
                        href={`/cases/${caseRecord.id}`}
                        className="hover:underline"
                      >
                        {caseRecord.title}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/crm/contacts/${caseRecord.contactId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {caseRecord.contact.firstName} {caseRecord.contact.lastName}
                      </Link>
                    </td>
                    <td className="px-6 py-4">{caseRecord.category}</td>
                    <td className="px-6 py-4">
                      <Badge className={PRIORITY_COLORS[caseRecord.priority] || "bg-gray-100 text-gray-800"}>
                        {caseRecord.priority}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={STATUS_COLORS[caseRecord.status] || "bg-gray-100 text-gray-800"}>
                        {caseRecord.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {caseRecord.assignedTo ? (
                        <span className="text-gray-700">{caseRecord.assignedTo.name}</span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatDate(caseRecord.openedDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/cases"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </Card>
      )}
    </div>
  );
}
