import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/settings";
import Link from "next/link";
import { Users, Plus, Search, AlertCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ExportButton } from "@/components/ui/export-button";
import { ContactsTable } from "@/components/contacts/contacts-table";

const PAGE_SIZE = 50;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; lottery?: string; missing?: string; page?: string; archived?: string; sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const typeFilter = params.type || "";
  const lotteryFilter = params.lottery || "";
  const missingFilter = params.missing || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const showArchived = params.archived === "true";
  const sortField = params.sort || "createdAt";
  const sortDir = (params.dir === "asc" || params.dir === "desc") ? params.dir : "desc";

  const where = {
    AND: [
      search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { postcode: { contains: search, mode: "insensitive" as const } },
              ...(!isNaN(parseInt(search, 10)) ? [{ donorId: { equals: parseInt(search, 10) } }] : []),
            ],
          }
        : {},
      typeFilter ? { types: { has: typeFilter } } : {},
      lotteryFilter === "yes" ? { isLotteryMember: true } : {},
      missingFilter === "phone" ? { OR: [{ phone: null }, { phone: "" }] } : {},
      missingFilter === "email" ? { OR: [{ email: null }, { email: "" }] } : {},
      // Hide archived contacts by default; show all when "Show Archived" is on
      showArchived ? {} : { isArchived: false },
    ],
  };

  // Build dynamic orderBy from sort params
  const orderByMap: Record<string, any> = {
    createdAt: { createdAt: sortDir },
    firstName: { firstName: sortDir },
    lastName: { lastName: sortDir },
    email: { email: sortDir },
    donorId: { donorId: sortDir },
  };
  const orderBy = orderByMap[sortField] || { createdAt: "desc" };

  const [contacts, totalCount] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        organisation: true,
        tags: { include: { tag: true } },
        volunteerProfile: true,
        giftAids: {
          where: { status: "ACTIVE" },
          select: { id: true, type: true },
        },
        donations: {
          select: { amount: true },
        },
      },
      orderBy,
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contact.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const [systemSettings, availableTags] = await Promise.all([
    getSystemSettings(),
    prisma.tag.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Build search params for pagination links (preserve existing filters + sort)
  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (typeFilter) paginationParams.type = typeFilter;
  if (lotteryFilter) paginationParams.lottery = lotteryFilter;
  if (missingFilter) paginationParams.missing = missingFilter;
  if (showArchived) paginationParams.archived = "true";
  if (sortField && sortField !== "createdAt") paginationParams.sort = sortField;
  if (sortDir && sortDir !== "desc") paginationParams.dir = sortDir;

  // Build sort params (all current search params except sort/dir/page, used by SortableHeader)
  const sortParams: Record<string, string> = {};
  if (search) sortParams.search = search;
  if (typeFilter) sortParams.type = typeFilter;
  if (lotteryFilter) sortParams.lottery = lotteryFilter;
  if (missingFilter) sortParams.missing = missingFilter;
  if (showArchived) sortParams.archived = "true";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 mt-1">
            {totalCount.toLocaleString()} contact{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton />
          <Link href="/crm/contacts/import">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
          </Link>
          <Link href="/crm/contacts/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </Link>
        </div>
      </div>

      {/* Missing data banner */}
      {missingFilter && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <p className="text-sm text-amber-800 font-medium">
              {missingFilter === "phone"
                ? "Showing contacts missing a phone number"
                : "Showing contacts missing an email address"}
            </p>
          </div>
          <Link href="/crm/contacts" className="text-sm text-amber-700 hover:text-amber-900 underline">
            Clear filter
          </Link>
        </div>
      )}

      {/* Search and filters */}
      <Card className="p-4">
        <form className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Search by name, email, postcode, or donor ID..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="VOLUNTEER">Volunteer</option>
            <option value="DONOR">Donor</option>
          </select>
          <select
            name="lottery"
            defaultValue={lotteryFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Lottery</option>
            <option value="yes">Lottery Members</option>
          </select>
          <select
            name="missing"
            defaultValue={missingFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Data</option>
            <option value="phone">Missing Phone</option>
            <option value="email">Missing Email</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              name="archived"
              value="true"
              defaultChecked={showArchived}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Show Archived
          </label>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </Card>

      {/* Contact list */}
      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts found"
          description={search ? "Try adjusting your search or filters." : "Get started by adding your first contact to the CRM."}
          actionLabel="Add Contact"
          actionHref="/crm/contacts/new"
        />
      ) : (
        <Card>
          <ContactsTable
            contacts={contacts}
            goldDonorThreshold={Number(systemSettings.goldDonorThreshold)}
            availableTags={availableTags}
            currentSort={sortField}
            currentDir={sortDir}
            sortParams={sortParams}
          />
          <div className="px-6 pb-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalCount}
              pageSize={PAGE_SIZE}
              baseUrl="/crm/contacts"
              searchParams={paginationParams}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
