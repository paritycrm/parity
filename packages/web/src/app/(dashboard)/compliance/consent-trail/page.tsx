import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CheckCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 50;

export default async function ConsentTrailPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; consentType?: string; action?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const consentTypeFilter = params.consentType || "";
  const actionFilter = params.action || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const skip = (currentPage - 1) * PAGE_SIZE;

  // Build where clause for consent records, including contact name search
  const where: Parameters<typeof prisma.consentRecord.findMany>[0]["where"] = {
    AND: [
      consentTypeFilter ? { consentType: consentTypeFilter } : {},
      actionFilter ? { action: actionFilter } : {},
      search
        ? {
            contact: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {},
    ],
  };

  // Get consent records with pagination and include the contact relation
  const [consentRecords, totalCount] = await Promise.all([
    prisma.consentRecord.findMany({
      where,
      include: {
        recordedBy: true,
        contact: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { recordedAt: "desc" },
      take: PAGE_SIZE,
      skip,
    }),
    prisma.consentRecord.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const consentTypeColors: Record<string, string> = {
    POST: "bg-blue-100 text-blue-800",
    EMAIL: "bg-purple-100 text-purple-800",
    PHONE: "bg-green-100 text-green-800",
    SMS: "bg-yellow-100 text-yellow-800",
    DATA_PROCESSING: "bg-red-100 text-red-800",
    MARKETING: "bg-indigo-100 text-indigo-800",
    RESEARCH: "bg-pink-100 text-pink-800",
  };

  const actionColors: Record<string, string> = {
    GRANTED: "bg-green-100 text-green-800",
    WITHDRAWN: "bg-red-100 text-red-800",
    UPDATED: "bg-blue-100 text-blue-800",
  };

  // Build base URL for pagination links
  const buildPageUrl = (page: number) => {
    const urlParams = new URLSearchParams();
    if (search) urlParams.set("search", search);
    if (consentTypeFilter) urlParams.set("consentType", consentTypeFilter);
    if (actionFilter) urlParams.set("action", actionFilter);
    urlParams.set("page", String(page));
    return `/compliance/consent-trail?${urlParams.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Consent Audit Trail</h1>
        <p className="text-gray-500 mt-1">Track all consent grants, withdrawals, and updates</p>
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
              placeholder="Search by contact name..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="consentType"
            defaultValue={consentTypeFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="POST">Post</option>
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
            <option value="SMS">SMS</option>
            <option value="DATA_PROCESSING">Data Processing</option>
            <option value="MARKETING">Marketing</option>
            <option value="RESEARCH">Research</option>
          </select>
          <select
            name="action"
            defaultValue={actionFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Actions</option>
            <option value="GRANTED">Granted</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="UPDATED">Updated</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Filter
          </button>
        </form>
      </Card>

      {/* Consent records table */}
      {consentRecords.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No consent records found</h3>
          <p className="text-gray-500 mt-1">Consent records will appear here as they are recorded</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date/Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Previous
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    New
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recorded By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {consentRecords.map((record) => {
                  const contactName = record.contact
                    ? `${record.contact.firstName} ${record.contact.lastName}`
                    : record.contactId;
                  return (
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(record.recordedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <Link
                          href={`/crm/contacts/${record.contactId}`}
                          className="text-indigo-600 hover:text-indigo-700"
                        >
                          {contactName}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={consentTypeColors[record.consentType] || ""}>
                          {record.consentType.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={actionColors[record.action] || ""}>
                          {record.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {record.previousValue === null
                          ? "—"
                          : record.previousValue
                            ? "Yes"
                            : "No"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {record.newValue ? "Yes" : "No"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {record.source ? record.source.replace(/_/g, " ") : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {record.recordedBy.name}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {skip + 1}–{Math.min(skip + PAGE_SIZE, totalCount)} of {totalCount} records
          </p>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            buildPageUrl={buildPageUrl}
          />
        </div>
      )}

      {totalPages <= 1 && totalCount > 0 && (
        <p className="text-xs text-gray-500">
          Showing {totalCount} consent record{totalCount !== 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}
