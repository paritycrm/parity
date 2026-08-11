import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CreditCard, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; type?: string; page?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const statusFilter = params.status || "";
  const typeFilter = params.type || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  // Calculate summary metrics
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const [successedThisMonth, pendingCount, failedCount, activeSubscriptions] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        status: "SUCCEEDED",
        paidAt: { gte: thisMonth },
      },
      _sum: { amount: true },
    }),
    prisma.payment.count({
      where: { status: "PENDING" },
    }),
    prisma.payment.count({
      where: { status: "FAILED" },
    }),
    prisma.subscription.count({
      where: { status: "ACTIVE" },
    }),
  ]);

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
      typeFilter ? { type: typeFilter } : {},
      ...(dateFrom || dateTo
        ? [
            {
              paymentDate: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
              },
            },
          ]
        : []),
    ],
  };

  const [payments, totalCount] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        contact: true,
        provider: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.payment.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (statusFilter) paginationParams.status = statusFilter;
  if (typeFilter) paginationParams.type = typeFilter;
  if (dateFrom) paginationParams.dateFrom = dateFrom;
  if (dateTo) paginationParams.dateTo = dateTo;

  const statusColors: Record<string, string> = {
    SUCCEEDED: "bg-green-100 text-green-800",
    PENDING: "bg-yellow-100 text-yellow-800",
    FAILED: "bg-red-100 text-red-800",
    REFUNDED: "bg-purple-100 text-purple-800",
    CANCELLED: "bg-gray-100 text-gray-800",
  };

  const typeColors: Record<string, string> = {
    ONE_OFF: "bg-blue-100 text-blue-800",
    SUBSCRIPTION: "bg-indigo-100 text-indigo-800",
    EVENT_FEE: "bg-orange-100 text-orange-800",
    MEMBERSHIP_FEE: "bg-pink-100 text-pink-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} payment transactions</p>
        </div>
        <Link href="/finance/payments/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Record Payment
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Total Received (This Month)</div>
          <div className="text-3xl font-bold text-gray-900">
            £{Number(successedThisMonth._sum.amount || 0).toFixed(2)}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Pending Payments</div>
          <div className="text-3xl font-bold text-yellow-600">{pendingCount}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Failed Payments</div>
          <div className="text-3xl font-bold text-red-600">{failedCount}</div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Active Subscriptions</div>
          <div className="text-3xl font-bold text-indigo-600">{activeSubscriptions}</div>
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
            <option value="SUCCEEDED">Succeeded</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="ONE_OFF">One-off</option>
            <option value="SUBSCRIPTION">Subscription</option>
            <option value="EVENT_FEE">Event Fee</option>
            <option value="MEMBERSHIP_FEE">Membership Fee</option>
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

      {/* Payments list */}
      {payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments found"
          description="Get started by recording your first payment."
          actionLabel="Record Payment"
          actionHref="/finance/payments/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Provider
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/finance/payments/${payment.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {payment.contact.firstName} {payment.contact.lastName}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      £{Number(payment.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={typeColors[payment.type] || "bg-gray-100 text-gray-800"}>
                        {payment.type.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {payment.method || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={statusColors[payment.status] || "bg-gray-100 text-gray-800"}>
                        {payment.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {payment.provider?.name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/finance/payments"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </Card>
      )}
    </div>
  );
}
