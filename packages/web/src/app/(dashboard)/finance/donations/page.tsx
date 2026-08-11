import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { DollarSign, Plus, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function DonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; page?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const typeFilter = params.type || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";

  const where = {
    AND: [
      search
        ? {
            OR: [
              { reference: { contains: search } },
              { contact: { firstName: { contains: search } } },
              { contact: { lastName: { contains: search } } },
            ],
          }
        : {},
      typeFilter ? { type: typeFilter } : {},
      ...(dateFrom || dateTo
        ? [
            {
              date: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
              },
            },
          ]
        : []),
    ],
  };

  const [donations, totalCount] = await Promise.all([
    prisma.donation.findMany({
      where,
      include: {
        contact: true,
        campaign: true,
        ledgerCode: true,
      },
      orderBy: { date: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.donation.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (typeFilter) paginationParams.type = typeFilter;
  if (dateFrom) paginationParams.dateFrom = dateFrom;
  if (dateTo) paginationParams.dateTo = dateTo;

  const typeColors: Record<string, string> = {
    DONATION: "bg-green-100 text-green-800",
    PAYMENT: "bg-blue-100 text-blue-800",
    GIFT: "bg-purple-100 text-purple-800",
    EVENT_FEE: "bg-yellow-100 text-yellow-800",
    SPONSORSHIP: "bg-orange-100 text-orange-800",
    LEGACY: "bg-indigo-100 text-indigo-800",
    GRANT: "bg-pink-100 text-pink-800",
    IN_KIND: "bg-gray-100 text-gray-800",
  };

  const statusColors: Record<string, string> = {
    RECEIVED: "bg-green-50 text-green-700",
    PENDING: "bg-yellow-50 text-yellow-700",
    REFUNDED: "bg-red-50 text-red-700",
    CANCELLED: "bg-gray-50 text-gray-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Donations</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} donations</p>
        </div>
        <div className="flex gap-3">
          <Link href="/finance/donations/import">
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Import
            </Button>
          </Link>
          <Link href="/finance/donations/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Donation
            </Button>
          </Link>
        </div>
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
              placeholder="Search by reference or contact..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="DONATION">Donation</option>
            <option value="PAYMENT">Payment</option>
            <option value="GIFT">Gift</option>
            <option value="EVENT_FEE">Event Fee</option>
            <option value="SPONSORSHIP">Sponsorship</option>
            <option value="LEGACY">Legacy</option>
            <option value="GRANT">Grant</option>
            <option value="IN_KIND">In Kind</option>
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

      {/* Donations list */}
      {donations.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="No donations found"
          description="Get started by recording your first donation."
          actionLabel="Add Donation"
          actionHref="/finance/donations/new"
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
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {donations.map((donation) => (
                  <tr key={donation.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <Link
                        href={`/finance/donations/${donation.id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        {formatDate(donation.date)}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {donation.contact.firstName} {donation.contact.lastName}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      £{Number(donation.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={typeColors[donation.type] || ""}>{donation.type}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {donation.campaign?.name || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={statusColors[donation.status] || ""}>
                        {donation.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/finance/donations"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </Card>
      )}
    </div>
  );
}
