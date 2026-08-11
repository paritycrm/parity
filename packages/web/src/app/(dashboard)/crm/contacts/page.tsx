import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/settings";
import Link from "next/link";
import { Users, Plus, Search, Ticket, AlertCircle, Crown, Heart, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 50;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; lottery?: string; missing?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const typeFilter = params.type || "";
  const lotteryFilter = params.lottery || "";
  const missingFilter = params.missing || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

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
    ],
  };

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
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contact.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const systemSettings = await getSystemSettings();

  // Build search params for pagination links (preserve existing filters)
  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (typeFilter) paginationParams.type = typeFilter;
  if (lotteryFilter) paginationParams.lottery = lotteryFilter;
  if (missingFilter) paginationParams.missing = missingFilter;

  const typeColors: Record<string, string> = {
    DONOR: "bg-green-100 text-green-800",
    VOLUNTEER: "bg-indigo-100 text-indigo-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 mt-1">
            {totalCount.toLocaleString()} contact{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/crm/contacts/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </Link>
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organisation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tags
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contacts.map((contact) => {
                  const lifetimeTotal = contact.donations.reduce((sum, d) => sum + Number(d.amount), 0);
                  const isGold = lifetimeTotal >= Number(systemSettings.goldDonorThreshold);
                  return (
                  <tr key={contact.id} className={isGold ? "bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100 hover:to-yellow-100 transition-colors" : "hover:bg-gray-50 transition-colors"}>
                    <td className="px-4 py-4">
                      <span className="text-xs font-mono text-gray-400">{String(contact.donorId).padStart(5, "0")}</span>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/crm/contacts/${contact.id}`}
                        className="flex items-center gap-3"
                      >
                        <Avatar firstName={contact.firstName} lastName={contact.lastName} size="sm" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {contact.firstName} {contact.lastName}
                            </p>
                            {isGold && (
                              <Crown className="h-3.5 w-3.5 text-amber-500" />
                            )}
                          </div>
                          {contact.phone && (
                            <p className="text-xs text-gray-500">{contact.phone}</p>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{contact.email || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        {contact.types.map((t) => (
                          <span key={t} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${typeColors[t] || "bg-gray-100 text-gray-800"}`}>
                            {t}
                          </span>
                        ))}
                        {contact.giftAids.some((ga) => ga.type === "STANDARD") && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-pink-100 text-pink-800 px-1.5 py-0.5 text-[10px] font-semibold">
                            <Heart className="h-2.5 w-2.5" />GA
                          </span>
                        )}
                        {contact.giftAids.some((ga) => ga.type === "RETAIL") && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-100 text-purple-800 px-1.5 py-0.5 text-[10px] font-semibold">
                            <Package className="h-2.5 w-2.5" />RGA
                          </span>
                        )}
                        {contact.isLotteryMember && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold">
                            <Ticket className="h-2.5 w-2.5" />LM
                          </span>
                        )}
                        {isGold && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-400 text-white px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">
                            <Crown className="h-2.5 w-2.5" />GOLD
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {contact.organisation?.name || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {contact.tags.map((ct) => (
                          <Badge key={ct.tagId} variant="outline" className="text-xs">
                            {ct.tag.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
