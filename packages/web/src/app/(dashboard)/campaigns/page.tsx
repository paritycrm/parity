import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { TrendingUp, Plus, Search, Target, PoundSterling, Megaphone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const statusFilter = params.status || "";
  const typeFilter = params.type || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const where = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {},
      statusFilter ? { status: statusFilter } : {},
      typeFilter ? { type: typeFilter } : {},
    ],
  };

  const [campaigns, totalCount] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: {
        _count: {
          select: { donations: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.campaign.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (statusFilter) paginationParams.status = statusFilter;
  if (typeFilter) paginationParams.type = typeFilter;

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    ACTIVE: "bg-green-100 text-green-800",
    PAUSED: "bg-yellow-100 text-yellow-800",
    COMPLETED: "bg-blue-100 text-blue-800",
    CANCELLED: "bg-red-100 text-red-800",
  };

  // Dashboard stats
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE").length;
  const completedCampaigns = campaigns.filter((c) => c.status === "COMPLETED").length;
  const totalRaised = campaigns.reduce((sum, c) => sum + Number(c.actualRaised), 0);
  const totalTarget = campaigns.reduce((sum, c) => sum + Number(c.budgetTarget || 0), 0);
  const overallProgress = totalTarget > 0 ? Math.min(Math.round((totalRaised / totalTarget) * 100), 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} campaigns</p>
        </div>
        <Link href="/campaigns/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Campaign
          </Button>
        </Link>
      </div>

      {/* Dashboard summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Megaphone className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalCampaigns}</p>
              <p className="text-xs text-gray-500">Total Campaigns</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activeCampaigns}</p>
              <p className="text-xs text-gray-500">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{completedCampaigns}</p>
              <p className="text-xs text-gray-500">Completed</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <PoundSterling className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalRaised > 0 ? `£${totalRaised.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "£0"}</p>
              <p className="text-xs text-gray-500">Total Raised</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Overall progress */}
      {totalTarget > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">Overall Campaign Progress</p>
            </div>
            <p className="text-sm font-semibold text-gray-900">
              £{totalRaised.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} of £{totalTarget.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ({overallProgress}%)
            </p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${overallProgress >= 100 ? "bg-green-500" : overallProgress >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </Card>
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
              placeholder="Search by name..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="APPEAL">Appeal</option>
            <option value="MAIL">Mail</option>
            <option value="EMAIL">Email</option>
            <option value="EVENT">Event</option>
            <option value="LEGACY">Legacy</option>
            <option value="CORPORATE">Corporate</option>
            <option value="OTHER">Other</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </Card>

      {/* Campaigns table */}
      {campaigns.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No campaigns found"
          description="Get started by creating your first campaign."
          actionLabel="Create Campaign"
          actionHref="/campaigns/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dates
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {campaigns.map((campaign) => {
                  const progress = campaign.budgetTarget && Number(campaign.budgetTarget) > 0
                    ? Math.min(Math.round((Number(campaign.actualRaised) / Number(campaign.budgetTarget)) * 100), 100)
                    : 0;
                  const hasTarget = campaign.budgetTarget && Number(campaign.budgetTarget) > 0;

                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {campaign.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {campaign.type || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {campaign.startDate && campaign.endDate
                          ? `${formatDate(campaign.startDate)} - ${formatDate(campaign.endDate)}`
                          : campaign.startDate
                          ? formatDate(campaign.startDate)
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        {hasTarget ? (
                          <div className="min-w-[140px]">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-700">
                                £{Number(campaign.actualRaised).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </span>
                              <span className="text-xs text-gray-400">
                                {progress}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${progress >= 100 ? "bg-green-500" : progress >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">of £{Number(campaign.budgetTarget!).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">No target set</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={statusColors[campaign.status] || ""}>
                          {campaign.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/campaigns"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </Card>
      )}
    </div>
  );
}
