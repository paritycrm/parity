import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Landmark, Plus, Search, TrendingUp, Trophy, Clock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { PipelineTimeline } from "@/components/ui/pipeline-timeline";
import { getGrantSteps } from "@/components/ui/pipeline-steps";

export default async function GrantsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; year?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const statusFilter = params.status || "";
  const yearFilter = params.year || "";

  // Build date filter
  let dateFilter = {};
  if (yearFilter) {
    const y = parseInt(yearFilter);
    dateFilter = {
      createdAt: {
        gte: new Date(`${y}-01-01`),
        lt: new Date(`${y + 1}-01-01`),
      },
    };
  }

  const grants = await prisma.grant.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { funderName: { contains: search, mode: "insensitive" } },
                { reference: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        statusFilter ? { status: statusFilter } : {},
        dateFilter,
      ],
    },
    include: {
      createdBy: true,
      funder: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Fetch all grants for year-over-year stats (unfiltered)
  const allGrants = await prisma.grant.findMany({
    select: {
      status: true,
      amountAwarded: true,
      amountRequested: true,
      createdAt: true,
      decisionDate: true,
    },
  });

  // Year options from data
  const yearsSet = new Set<number>();
  allGrants.forEach((g) => {
    yearsSet.add(g.createdAt.getFullYear());
    if (g.decisionDate) yearsSet.add(g.decisionDate.getFullYear());
  });
  const currentYear = new Date().getFullYear();
  yearsSet.add(currentYear);
  yearsSet.add(currentYear - 1);
  yearsSet.add(currentYear - 2);
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  // Current filtered stats
  const awardedGrants = grants.filter((g) =>
    ["SUCCESSFUL", "REPORTING", "COMPLETED"].includes(g.status)
  );
  const activeGrants = grants.filter((g) => g.status === "REPORTING");
  const pipelineGrants = grants.filter((g) =>
    ["IDENTIFIED", "RESEARCHING", "APPLYING", "SUBMITTED"].includes(g.status)
  );
  const pipelineValue = pipelineGrants.reduce((sum, g) => sum + (g.amountRequested || 0), 0);
  const totalAwarded = awardedGrants.reduce((sum, g) => sum + (g.amountAwarded || 0), 0);

  // Year-over-year comparison
  const thisYearGrants = allGrants.filter(
    (g) => g.decisionDate && g.decisionDate.getFullYear() === currentYear
  );
  const lastYearGrants = allGrants.filter(
    (g) => g.decisionDate && g.decisionDate.getFullYear() === currentYear - 1
  );
  const thisYearTotal = thisYearGrants
    .filter((g) => ["SUCCESSFUL", "REPORTING", "COMPLETED"].includes(g.status))
    .reduce((sum, g) => sum + (g.amountAwarded || 0), 0);
  const lastYearTotal = lastYearGrants
    .filter((g) => ["SUCCESSFUL", "REPORTING", "COMPLETED"].includes(g.status))
    .reduce((sum, g) => sum + (g.amountAwarded || 0), 0);
  const yoyChange = lastYearTotal > 0
    ? (((thisYearTotal - lastYearTotal) / lastYearTotal) * 100).toFixed(0)
    : null;

  const decidedGrants = allGrants.filter((g) =>
    ["SUCCESSFUL", "UNSUCCESSFUL", "REPORTING", "COMPLETED"].includes(g.status)
  );
  const wonGrants = allGrants.filter((g) =>
    ["SUCCESSFUL", "REPORTING", "COMPLETED"].includes(g.status)
  );
  const successRate = decidedGrants.length > 0
    ? ((wonGrants.length / decidedGrants.length) * 100).toFixed(0)
    : "0";

  const statusColors: Record<string, string> = {
    IDENTIFIED: "bg-blue-100 text-blue-800",
    RESEARCHING: "bg-blue-100 text-blue-800",
    APPLYING: "bg-yellow-100 text-yellow-800",
    SUBMITTED: "bg-yellow-100 text-yellow-800",
    SUCCESSFUL: "bg-purple-100 text-purple-800",
    UNSUCCESSFUL: "bg-red-100 text-red-800",
    REPORTING: "bg-green-100 text-green-800",
    COMPLETED: "bg-gray-100 text-gray-800",
  };

  const fmt = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grants</h1>
          <p className="text-gray-500 mt-1">Track and manage grant applications</p>
        </div>
        <Link href="/finance/grants/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Grant
          </Button>
        </Link>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Awarded Total</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalAwarded)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Landmark className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Active</p>
              <p className="text-lg font-bold text-gray-900">{activeGrants.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Pipeline</p>
              <p className="text-lg font-bold text-gray-900">{pipelineGrants.length} ({fmt(pipelineValue)})</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Target className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Success Rate</p>
              <p className="text-lg font-bold text-gray-900">{successRate}%</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{currentYear} vs {currentYear - 1}</p>
              <p className="text-lg font-bold text-gray-900">
                {fmt(thisYearTotal)}
                {yoyChange && (
                  <span className={`text-xs ml-1 ${parseInt(yoyChange) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {parseInt(yoyChange) >= 0 ? "+" : ""}{yoyChange}%
                  </span>
                )}
              </p>
            </div>
          </div>
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
              placeholder="Search by title, funder, or reference..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Status</option>
            <option value="IDENTIFIED">Identified</option>
            <option value="RESEARCHING">Researching</option>
            <option value="APPLYING">Applying</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="SUCCESSFUL">Successful</option>
            <option value="UNSUCCESSFUL">Unsuccessful</option>
            <option value="REPORTING">Reporting</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <select
            name="year"
            defaultValue={yearFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </Card>

      {/* Grants table */}
      {grants.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No grants found"
          description="Get started by creating your first grant record."
          actionLabel="New Grant"
          actionHref="/finance/grants/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Funder
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[220px]">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {grants.map((grant) => (
                  <tr key={grant.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <Link
                        href={`/finance/grants/${grant.id}`}
                        className="text-indigo-600 hover:text-indigo-700"
                      >
                        {grant.title}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {grant.funderId ? (
                        <Link
                          href="/crm/organisations"
                          className="text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          {grant.funderName}
                        </Link>
                      ) : (
                        grant.funderName
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {grant.amountAwarded
                        ? fmt(grant.amountAwarded)
                        : grant.amountRequested
                          ? `${fmt(grant.amountRequested)}`
                          : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <PipelineTimeline
                        steps={getGrantSteps(grant)}
                        currentStepKey={grant.status === "UNSUCCESSFUL" ? "SUBMITTED" : grant.status}
                        variant="grant"
                        size="compact"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={statusColors[grant.status] || ""}>{grant.status}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/finance/grants/${grant.id}`}
                        className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
