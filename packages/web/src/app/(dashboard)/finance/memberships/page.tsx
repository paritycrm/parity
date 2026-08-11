import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import { Users, CreditCard, Calendar, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function MembershipsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; dateFrom?: string; dateTo?: string }>;
}) {
  await requireAuth();

  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  const listWhere = {
    ...(dateFrom || dateTo
      ? {
          startDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
          },
        }
      : {}),
  };

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [memberships, totalCount, totalMemberCount, activeMemberCount, expiringMemberCount, activeMembershipsForRevenue, membershipTypes] = await Promise.all([
    prisma.membership.findMany({
      where: listWhere,
      include: {
        contact: true,
        membershipType: true,
      },
      orderBy: { startDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.membership.count({ where: listWhere }),
    // Stats queries (not date-filtered)
    prisma.membership.count({}),
    prisma.membership.count({ where: { status: "ACTIVE" } }),
    prisma.membership.count({
      where: {
        status: "ACTIVE",
        endDate: { gt: now, lte: thirtyDaysFromNow },
      },
    }),
    prisma.membership.findMany({
      where: { status: "ACTIVE" },
      select: { membershipTypeId: true },
    }),
    prisma.membershipType.findMany({
      where: { isActive: true },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (dateFrom) paginationParams.dateFrom = dateFrom;
  if (dateTo) paginationParams.dateTo = dateTo;

  // Calculate revenue from active memberships (not date-filtered)
  const totalRevenue = activeMembershipsForRevenue.reduce((sum, m) => {
    const type = membershipTypes.find((t) => t.id === m.membershipTypeId);
    return sum + Number(type?.price || 0);
  }, 0);

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    EXPIRED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-800",
    PENDING: "bg-yellow-100 text-yellow-800",
    LAPSED: "bg-orange-100 text-orange-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Memberships</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} memberships</p>
        </div>
        <Link href="/finance/memberships/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Membership
          </Button>
        </Link>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Members
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{totalMemberCount}</p>
            </div>
            <Users className="h-5 w-5 text-gray-400" />
          </div>
        </Card>

        <Card className="p-4 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Active
              </p>
              <p className="text-3xl font-bold text-green-600 mt-1">{activeMemberCount}</p>
            </div>
            <Users className="h-5 w-5 text-green-400" />
          </div>
        </Card>

        <Card className="p-4 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expiring Soon
              </p>
              <p className="text-3xl font-bold text-yellow-600 mt-1">{expiringMemberCount}</p>
            </div>
            <Calendar className="h-5 w-5 text-yellow-400" />
          </div>
        </Card>

        <Card className="p-4 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Annual Revenue
              </p>
              <p className="text-3xl font-bold text-indigo-600 mt-1">
                £{Number(totalRevenue).toFixed(2)}
              </p>
            </div>
            <CreditCard className="h-5 w-5 text-indigo-400" />
          </div>
        </Card>
      </div>

      {/* Date range filter */}
      <Card className="p-4">
        <form className="flex flex-col sm:flex-row gap-3">
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

      {/* Memberships List */}
      {memberships.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No memberships yet"
          description="Get started by creating your first membership."
          actionLabel="New Membership"
          actionHref="/finance/memberships/new"
        />
      ) : (
        <Card className="rounded-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Member Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    End Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Auto Renew
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {memberships.map((membership) => (
                  <tr key={membership.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-gray-600">
                      <Link
                        href={`/finance/memberships/${membership.id}`}
                        className="text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        {membership.memberNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {membership.contact.firstName} {membership.contact.lastName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {membership.membershipType.name}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={statusColors[membership.status] || ""}>
                        {membership.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(membership.startDate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(membership.endDate)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {membership.autoRenew ? (
                        <Badge className="bg-green-50 text-green-700">Auto</Badge>
                      ) : (
                        <Badge className="bg-gray-50 text-gray-700">Manual</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/finance/memberships/${membership.id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/finance/memberships"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </Card>
      )}
    </div>
  );
}
