import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { RefreshCw, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; frequency?: string; page?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const statusFilter = params.status || "";
  const frequencyFilter = params.frequency || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  // Calculate summary metrics
  const [
    activeCount,
    activeSubscriptions,
    pausedCount,
    allSubCount,
  ] = await Promise.all([
    prisma.subscription.count({
      where: { status: "ACTIVE" },
    }),
    prisma.subscription.groupBy({
      by: ["frequency"],
      where: { status: "ACTIVE" },
      _sum: { amount: true },
    }),
    prisma.subscription.count({
      where: { status: "PAUSED" },
    }),
    prisma.subscription.count({}),
  ]);

  // Normalise all frequencies to monthly equivalent
  const frequencyMultipliers: Record<string, number> = {
    WEEKLY: 52 / 12,
    FORTNIGHTLY: 26 / 12,
    MONTHLY: 1,
    QUARTERLY: 1 / 3,
    ANNUAL: 1 / 12,
    YEARLY: 1 / 12,
  };
  const monthlyRevenue = activeSubscriptions.reduce((total, group) => {
    const multiplier = frequencyMultipliers[group.frequency] || 1;
    return total + (Number(group._sum.amount) || 0) * multiplier;
  }, 0);

  const where = {
    AND: [
      search
        ? {
            OR: [
              { contact: { firstName: { contains: search, mode: "insensitive" as const } } },
              { contact: { lastName: { contains: search, mode: "insensitive" as const } } },
              { externalId: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {},
      statusFilter ? { status: statusFilter } : {},
      frequencyFilter ? { frequency: frequencyFilter } : {},
      ...(dateFrom || dateTo
        ? [
            {
              startDate: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
              },
            },
          ]
        : []),
    ],
  };

  const [subscriptions, totalCount] = await Promise.all([
    prisma.subscription.findMany({
      where,
      include: {
        contact: true,
        provider: true,
      },
      orderBy: { startDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.subscription.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (statusFilter) paginationParams.status = statusFilter;
  if (frequencyFilter) paginationParams.frequency = frequencyFilter;
  if (dateFrom) paginationParams.dateFrom = dateFrom;
  if (dateTo) paginationParams.dateTo = dateTo;

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    PAUSED: "bg-yellow-100 text-yellow-800",
    CANCELLED: "bg-red-100 text-red-800",
    EXPIRED: "bg-gray-100 text-gray-800",
  };

  const frequencyColors: Record<string, string> = {
    WEEKLY: "bg-blue-100 text-blue-800",
    MONTHLY: "bg-indigo-100 text-indigo-800",
    QUARTERLY: "bg-purple-100 text-purple-800",
    ANNUALLY: "bg-pink-100 text-pink-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} subscriptions</p>
        </div>
        <Link href="/finance/subscriptions/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Subscription
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Active Subscriptions</div>
          <div className="text-3xl font-bold text-green-600">{activeCount}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Monthly Revenue</div>
          <div className="text-3xl font-bold text-gray-900">
            £{monthlyRevenue.toFixed(2)}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Paused</div>
          <div className="text-3xl font-bold text-yellow-600">{pausedCount}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Total Subscriptions</div>
          <div className="text-3xl font-bold text-indigo-600">{allSubCount}</div>
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
              placeholder="Search by contact name or reference..."
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
            <option value="PAUSED">Paused</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
          </select>
          <select
            name="frequency"
            defaultValue={frequencyFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Frequencies</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUALLY">Annually</option>
          </select>
          <input
            name="dateFrom"
            type="date"
            defaultValue={dateFrom}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="dateTo"
            type="date"
            defaultValue={dateTo}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </Card>

      {/* Subscriptions list */}
      {subscriptions.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="No subscriptions found"
          description="Get started by creating your first subscription."
          actionLabel="New Subscription"
          actionHref="/finance/subscriptions/new"
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
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Provider
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/finance/subscriptions/${subscription.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {subscription.contact.firstName} {subscription.contact.lastName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      £{Number(subscription.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        className={
                          frequencyColors[subscription.frequency] || "bg-gray-100 text-gray-800"
                        }
                      >
                        {subscription.frequency}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        className={statusColors[subscription.status] || "bg-gray-100 text-gray-800"}
                      >
                        {subscription.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {subscription.nextPaymentDate
                        ? formatDate(subscription.nextPaymentDate)
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {subscription.provider?.name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/finance/subscriptions"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </Card>
      )}
    </div>
  );
}
