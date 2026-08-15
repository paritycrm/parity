import { prisma } from "@/lib/prisma";
import { getSystemSettings, getFinancialYearDates, getCurrentFinancialYear } from "@/lib/settings";
import Link from "next/link";
import { Calendar, Plus, Search, TrendingUp, Target, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

function ProgressBar({
  value,
  target,
  colour,
  height = "h-2",
}: {
  value: number;
  target: number;
  colour: string;
  height?: string;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const over = target > 0 && value > target;
  return (
    <div className={`w-full ${height} bg-gray-100 rounded-full overflow-hidden`}>
      <div
        className={`${height} rounded-full transition-all duration-500`}
        style={{
          width: `${pct}%`,
          backgroundColor: over ? "#ef4444" : colour,
        }}
      />
    </div>
  );
}

function AnnualGauge({
  label,
  value,
  target,
  colour,
  isCost,
}: {
  label: string;
  value: number;
  target: number;
  colour: string;
  isCost?: boolean;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const over = target > 0 && value > target;
  const strokeDasharray = `${(pct / 100) * 251.2} 251.2`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke={over ? (isCost ? "#ef4444" : colour) : colour}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-gray-900">
            {target > 0 ? `${Math.round(pct)}%` : "—"}
          </span>
        </div>
      </div>
      <p className="text-sm font-semibold text-gray-700 mt-1">{label}</p>
      <p className="text-xs text-gray-500">
        £{value.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        {target > 0 && (
          <span className="text-gray-400"> / £{target.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
        )}
      </p>
    </div>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const statusFilter = params.status || "";
  const typeFilter = params.type || "";
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const settings = await getSystemSettings();
  const fyLabel = getCurrentFinancialYear(settings.financialYearEndMonth, settings.financialYearEndDay);
  const { start: fyStart, end: fyEnd } = getFinancialYearDates(fyLabel, settings.financialYearEndMonth, settings.financialYearEndDay);

  // Fetch all events in the financial year (for the annual roll-up)
  const allFYEvents = await prisma.event.findMany({
    where: {
      startDate: { gte: fyStart, lte: fyEnd },
    },
    select: {
      id: true,
      incomeLines: { select: { actual: true } },
      costLines: { select: { actual: true } },
      finance: { select: { incomeTarget: true, costTarget: true, profitTarget: true } },
    },
  });

  const annualIncome = allFYEvents.reduce((sum, e) => sum + e.incomeLines.reduce((s, l) => s + Number(l.actual), 0), 0);
  const annualCosts = allFYEvents.reduce((sum, e) => sum + e.costLines.reduce((s, l) => s + Number(l.actual), 0), 0);
  const annualProfit = annualIncome - annualCosts;

  const annualIncomeTarget = (settings as any).eventsIncomeTarget || 0;
  const annualCostBudget = (settings as any).eventsCostBudget || 0;
  const annualProfitTarget = (settings as any).eventsProfitTarget || 0;

  // Build where clause for filtered events list
  const where = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search } },
              { location: { contains: search } },
            ],
          }
        : {},
      statusFilter ? { status: statusFilter } : {},
      typeFilter ? { type: typeFilter } : {},
    ],
  };

  // Fetch filtered events for the list
  const [events, totalCount] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        eventType: true,
        campaign: true,
        incomeLines: { select: { actual: true } },
        costLines: { select: { actual: true } },
        finance: { select: { incomeTarget: true, costTarget: true } },
        _count: {
          select: { attendees: true },
        },
      },
      orderBy: { startDate: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.event.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const paginationParams: Record<string, string> = {};
  if (search) paginationParams.search = search;
  if (statusFilter) paginationParams.status = statusFilter;
  if (typeFilter) paginationParams.type = typeFilter;

  const statusColors: Record<string, string> = {
    PLANNED: "bg-gray-100 text-gray-800",
    OPEN: "bg-blue-100 text-blue-800",
    IN_PROGRESS: "bg-purple-100 text-purple-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };

  const hasTargets = annualIncomeTarget > 0 || annualCostBudget > 0 || annualProfitTarget > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} events</p>
        </div>
        <Link href="/events/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Event
          </Button>
        </Link>
      </div>

      {/* Annual Progress Dashboard */}
      {hasTargets && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Annual Events Programme — FY {fyLabel}
              </h2>
            </div>
            <Link href="/settings/events" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              <Target className="h-3.5 w-3.5" /> Edit Targets
            </Link>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <p className="text-xs font-medium text-green-700 uppercase">Total Income</p>
              <p className="text-xl font-bold text-green-800 mt-1">
                £{annualIncome.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              {annualIncomeTarget > 0 && (
                <p className="text-xs text-green-600 mt-0.5">
                  {Math.round((annualIncome / annualIncomeTarget) * 100)}% of target
                </p>
              )}
            </div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <p className="text-xs font-medium text-red-700 uppercase">Total Costs</p>
              <p className="text-xl font-bold text-red-800 mt-1">
                £{annualCosts.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              {annualCostBudget > 0 && (
                <p className="text-xs text-red-600 mt-0.5">
                  {Math.round((annualCosts / annualCostBudget) * 100)}% of budget
                </p>
              )}
            </div>
            <div className={`rounded-xl p-4 border ${annualProfit >= 0 ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
              <p className={`text-xs font-medium uppercase ${annualProfit >= 0 ? "text-blue-700" : "text-amber-700"}`}>Profit</p>
              <p className={`text-xl font-bold mt-1 ${annualProfit >= 0 ? "text-blue-800" : "text-amber-800"}`}>
                £{annualProfit.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              {annualProfitTarget > 0 && (
                <p className={`text-xs mt-0.5 ${annualProfit >= 0 ? "text-blue-600" : "text-amber-600"}`}>
                  {Math.round((annualProfit / annualProfitTarget) * 100)}% of target
                </p>
              )}
            </div>
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
              <p className="text-xs font-medium text-indigo-700 uppercase">Events This Year</p>
              <p className="text-xl font-bold text-indigo-800 mt-1">{allFYEvents.length}</p>
              <p className="text-xs text-indigo-600 mt-0.5">
                contributing to targets
              </p>
            </div>
          </div>

          {/* Gauge Dials */}
          <div className="flex justify-center gap-10">
            <AnnualGauge value={annualIncome} target={annualIncomeTarget} label="Income" colour="#16a34a" />
            <AnnualGauge value={annualCosts} target={annualCostBudget} label="Costs" colour="#dc2626" isCost />
            <AnnualGauge value={annualProfit} target={annualProfitTarget} label="Profit" colour="#2563eb" />
          </div>
        </Card>
      )}

      {/* No targets hint */}
      {!hasTargets && (
        <Card className="p-4 bg-indigo-50 border-indigo-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-600" />
              <p className="text-sm text-indigo-800">
                Set annual targets to see your events programme progress at a glance.
              </p>
            </div>
            <Link href="/settings/events">
              <Button variant="outline" size="sm" className="text-indigo-700 border-indigo-300">
                Set Targets <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
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
              placeholder="Search by name or location..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Status</option>
            <option value="PLANNED">Planned</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="FUNDRAISER">Fundraiser</option>
            <option value="GALA">Gala</option>
            <option value="AUCTION">Auction</option>
            <option value="CHALLENGE">Challenge</option>
            <option value="COMMUNITY">Community</option>
            <option value="MEMORIAL">Memorial</option>
            <option value="OTHER">Other</option>
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </Card>

      {/* Events list */}
      {events.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No events found"
          description="Get started by creating your first event."
          actionLabel="Create Event"
          actionHref="/events/new"
        />
      ) : (
        <>
          <div className="space-y-3">
            {events.map((event) => {
              const evtIncome = event.incomeLines.reduce((s, l) => s + l.actual, 0);
              const evtCosts = event.costLines.reduce((s, l) => s + l.actual, 0);
              const evtProfit = evtIncome - evtCosts;
              const evtIncomeTarget = event.finance?.incomeTarget || 0;
              const evtCostTarget = event.finance?.costTarget || 0;

              return (
                <Card key={event.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <Link href={`/events/${event.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {event.name}
                          </h3>
                          <Badge className={`text-xs ${statusColors[event.status] || ""}`}>
                            {event.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{formatDate(event.startDate)}</span>
                          {event.location && <span>· {event.location}</span>}
                          {(event.eventType?.name || event.type) && <span>· {event.eventType?.name || event.type}</span>}
                          {event.campaign && <span>· {event.campaign.name}</span>}
                          <span>· {event._count.attendees} attendees</span>
                        </div>
                      </div>

                      {/* Financial summary */}
                      <div className="flex items-center gap-6 flex-shrink-0 text-right">
                        <div>
                          <p className="text-xs text-gray-500">Income</p>
                          <p className="text-sm font-semibold text-green-700">
                            £{evtIncome.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Costs</p>
                          <p className="text-sm font-semibold text-red-700">
                            £{evtCosts.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Profit</p>
                          <p className={`text-sm font-semibold ${evtProfit >= 0 ? "text-blue-700" : "text-amber-700"}`}>
                            £{evtProfit.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Per-event progress bar */}
                    {evtIncomeTarget > 0 && (
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Income progress</span>
                          <span>
                            £{evtIncome.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / £{evtIncomeTarget.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            {" "}({evtIncomeTarget > 0 ? Math.round((evtIncome / evtIncomeTarget) * 100) : 0}%)
                          </span>
                        </div>
                        <ProgressBar value={evtIncome} target={evtIncomeTarget} colour="#16a34a" />
                      </div>
                    )}
                    {evtCostTarget > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Cost spend</span>
                          <span>
                            £{evtCosts.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / £{evtCostTarget.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            {" "}({evtCostTarget > 0 ? Math.round((evtCosts / evtCostTarget) * 100) : 0}%)
                          </span>
                        </div>
                        <ProgressBar value={evtCosts} target={evtCostTarget} colour="#dc2626" />
                      </div>
                    )}
                  </Link>
                </Card>
              );
            })}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/events"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </>
      )}
    </div>
  );
}
