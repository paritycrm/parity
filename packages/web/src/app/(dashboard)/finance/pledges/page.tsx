import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus, Search, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatCurrency } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function PledgesPage({
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
            OR: [
              { contact: { firstName: { contains: search } } },
              { contact: { lastName: { contains: search } } },
              { contact: { email: { contains: search } } },
            ],
          }
        : {},
      statusFilter ? { status: statusFilter } : {},
    ],
  };

  const [pledges, totalCount] = await Promise.all([
    prisma.pledge.findMany({
      where,
      include: {
        contact: true,
        campaign: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.pledge.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (statusFilter) paginationParams.status = statusFilter;

  // Calculate stats
  const stats = {
    totalPledges: pledges.length,
    totalAmount: pledges.reduce((sum, p) => sum + Number(p.amount), 0),
    totalFulfilled: pledges.reduce((sum, p) => sum + Number(p.totalFulfilled), 0),
    activePledges: pledges.filter((p) => p.status === "ACTIVE").length,
  };

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-blue-100 text-blue-800",
    FULFILLED: "bg-green-100 text-green-800",
    PARTIALLY_FULFILLED: "bg-yellow-100 text-yellow-800",
    CANCELLED: "bg-gray-100 text-gray-800",
    OVERDUE: "bg-red-100 text-red-800",
  };

  const frequencyLabels: Record<string, string> = {
    ONE_TIME: "One-time",
    MONTHLY: "Monthly",
    QUARTERLY: "Quarterly",
    ANNUALLY: "Annually",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pledges</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} pledges</p>
        </div>
        <Link href="/finance/pledges/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Pledge
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-gray-600">Total Pledges</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalPledges}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Total Amount</p>
          <p className="text-3xl font-bold text-gray-900">
            £{Number(stats.totalAmount).toFixed(2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Total Fulfilled</p>
          <p className="text-3xl font-bold text-gray-900">
            £{Number(stats.totalFulfilled).toFixed(2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Active Pledges</p>
          <p className="text-3xl font-bold text-gray-900">{stats.activePledges}</p>
        </Card>
      </div>

      {/* Search and filters */}
      <Card className="p-4">
        <form className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Search by contact name or email..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PARTIALLY_FULFILLED">Partially Fulfilled</option>
            <option value="FULFILLED">Fulfilled</option>
            <option value="OVERDUE">Overdue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </Card>

      {/* Pledges list */}
      {pledges.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No pledges found"
          description="Get started by creating your first pledge."
          actionLabel="New Pledge"
          actionHref="/finance/pledges/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Frequency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fulfilled
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pledges.map((pledge) => (
                  <tr key={pledge.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <Link
                        href={`/finance/pledges/${pledge.id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        {pledge.contact.firstName} {pledge.contact.lastName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      £{Number(pledge.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {frequencyLabels[pledge.frequency] || pledge.frequency}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      £{Number(pledge.totalFulfilled).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {pledge.campaign?.name || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={statusColors[pledge.status] || ""}>
                        {pledge.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDate(pledge.startDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/finance/pledges"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </Card>
      )}
    </div>
  );
}
