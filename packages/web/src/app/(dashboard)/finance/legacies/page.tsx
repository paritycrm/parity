import { prisma } from "@/lib/prisma";
import { getSystemSettings, getFinancialYearDates, getCurrentFinancialYear } from "@/lib/settings";
import Link from "next/link";
import { Heart, Plus, Search, TrendingUp, Banknote, Clock, PiggyBank, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { PipelineTimeline } from "@/components/ui/pipeline-timeline";
import { getLegacySteps } from "@/components/ui/pipeline-steps";

export default async function LegaciesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; year?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const statusFilter = params.status || "";
  const yearFilter = params.year || "";

  // Get financial year settings
  const settings = await getSystemSettings();
  const fyEndMonth = settings.financialYearEndMonth;
  const fyEndDay = settings.financialYearEndDay;
  const currentFY = getCurrentFinancialYear(fyEndMonth, fyEndDay);

  // Build date filter based on financial year
  let dateFilter = {};
  if (yearFilter) {
    const fy = parseInt(yearFilter);
    const { start, end } = getFinancialYearDates(fy, fyEndMonth, fyEndDay);
    dateFilter = {
      dateNotified: { gte: start, lte: end },
    };
  }

  const legacies = await prisma.legacy.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { deceasedName: { contains: search, mode: "insensitive" as const } },
                { solicitorName: { contains: search, mode: "insensitive" as const } },
                { solicitorFirm: { contains: search, mode: "insensitive" as const } },
                { contact: { firstName: { contains: search, mode: "insensitive" as const } } },
                { contact: { lastName: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {},
        statusFilter ? { status: statusFilter } : {},
        dateFilter,
      ],
    },
    include: {
      contact: true,
      createdBy: true,
    },
    orderBy: { dateNotified: "desc" },
    take: 200,
  });

  // Fetch all legacies for historic analysis & forecasting
  const allLegacies = await prisma.legacy.findMany({
    select: {
      status: true,
      estimatedAmount: true,
      receivedAmount: true,
      dateNotified: true,
      dateReceived: true,
      expectedPaymentDate: true,
      probateGranted: true,
      createdAt: true,
    },
  });

  // Financial year options
  const fySet = new Set<number>();
  allLegacies.forEach((l) => {
    // Determine which FY this legacy belongs to
    const notifiedDate = l.dateNotified;
    const nm = notifiedDate.getMonth() + 1;
    const nd = notifiedDate.getDate();
    const ny = notifiedDate.getFullYear();
    const fy = (nm > fyEndMonth || (nm === fyEndMonth && nd > fyEndDay)) ? ny + 1 : ny;
    fySet.add(fy);
  });
  fySet.add(currentFY);
  fySet.add(currentFY - 1);
  fySet.add(currentFY - 2);
  const financialYears = Array.from(fySet).sort((a, b) => b - a);

  // Current filtered view stats
  const totalEstimated = legacies.reduce((sum, l) => sum + Number(l.estimatedAmount || 0), 0);
  const totalReceived = legacies.reduce((sum, l) => sum + Number(l.receivedAmount || 0), 0);
  const inAdministration = legacies.filter((l) =>
    ["INVESTIGATING", "PROBATE", "AWAITING_PAYMENT"].includes(l.status)
  ).length;
  const notified = legacies.filter((l) => l.status === "NOTIFIED").length;

  // Pipeline value (legacies not yet received)
  const pipelineValue = allLegacies
    .filter((l) => ["NOTIFIED", "INVESTIGATING", "PROBATE", "AWAITING_PAYMENT"].includes(l.status))
    .reduce((s, l) => s + Number(l.estimatedAmount || 0), 0);

  // Average time to receipt
  const completedLegacies = allLegacies.filter((l) => l.dateReceived && l.status === "RECEIVED");
  const avgMonths = completedLegacies.length > 0
    ? Math.round(
        completedLegacies.reduce((sum, l) => {
          const notifiedTime = l.dateNotified.getTime();
          const receivedTime = l.dateReceived!.getTime();
          return sum + (receivedTime - notifiedTime) / (1000 * 60 * 60 * 24 * 30);
        }, 0) / completedLegacies.length
      )
    : null;

  // Historic FY comparison
  const buildFYStats = (fy: number) => {
    const { start, end } = getFinancialYearDates(fy, fyEndMonth, fyEndDay);
    const fyLegacies = allLegacies.filter(
      (l) => l.dateNotified >= start && l.dateNotified <= end
    );
    const received = allLegacies.filter(
      (l) => l.dateReceived && l.dateReceived >= start && l.dateReceived <= end
    );
    return {
      notified: fyLegacies.length,
      estimatedValue: fyLegacies.reduce((s, l) => s + Number(l.estimatedAmount || 0), 0),
      receivedCount: received.length,
      receivedValue: received.reduce((s, l) => s + Number(l.receivedAmount || 0), 0),
    };
  };

  const thisFY = buildFYStats(currentFY);
  const lastFY = buildFYStats(currentFY - 1);
  const twoFYAgo = buildFYStats(currentFY - 2);

  const yoyChange = lastFY.receivedValue > 0
    ? (((thisFY.receivedValue - lastFY.receivedValue) / lastFY.receivedValue) * 100).toFixed(0)
    : null;

  // === MONTHLY FORECAST ===
  // Show next 12 months of expected legacy payments based on pipeline + average time from status to receipt
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const forecastMonths: { label: string; month: number; year: number; estimated: number; count: number }[] = [];

  // Average time from probate to receipt and from notification to receipt
  const avgProbateToReceipt = completedLegacies.filter((l) => l.probateGranted).length > 0
    ? completedLegacies
        .filter((l) => l.probateGranted)
        .reduce((sum, l) => {
          return sum + (l.dateReceived!.getTime() - l.probateGranted!.getTime()) / (1000 * 60 * 60 * 24 * 30);
        }, 0) / completedLegacies.filter((l) => l.probateGranted).length
    : 3; // default 3 months

  const avgNotifiedToReceipt = avgMonths || 12; // default 12 months

  // Build 12 months forecast
  for (let i = 0; i < 12; i++) {
    const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const m = forecastDate.getMonth();
    const y = forecastDate.getFullYear();
    forecastMonths.push({
      label: `${monthNames[m]} ${y}`,
      month: m,
      year: y,
      estimated: 0,
      count: 0,
    });
  }

  // Assign pipeline legacies to forecast months
  const pipelineLegacies = allLegacies.filter((l) =>
    ["NOTIFIED", "INVESTIGATING", "PROBATE", "AWAITING_PAYMENT"].includes(l.status)
  );

  pipelineLegacies.forEach((l) => {
    let expectedDate: Date;

    if (l.expectedPaymentDate) {
      // Use the explicitly set expected payment date
      expectedDate = l.expectedPaymentDate;
    } else if (l.status === "AWAITING_PAYMENT") {
      // Expected within 1–2 months
      expectedDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    } else if (l.status === "PROBATE" && l.probateGranted) {
      // Use average probate-to-receipt time
      const msToAdd = avgProbateToReceipt * 30 * 24 * 60 * 60 * 1000;
      expectedDate = new Date(l.probateGranted.getTime() + msToAdd);
    } else {
      // Use average notification-to-receipt time
      const msToAdd = avgNotifiedToReceipt * 30 * 24 * 60 * 60 * 1000;
      expectedDate = new Date(l.dateNotified.getTime() + msToAdd);
    }

    // If the expected date has passed and no explicit date was set, push to next month
    if (expectedDate < now && !l.expectedPaymentDate) {
      expectedDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    }

    // Find matching forecast month
    const idx = forecastMonths.findIndex(
      (fm) => fm.month === expectedDate.getMonth() && fm.year === expectedDate.getFullYear()
    );
    if (idx >= 0) {
      forecastMonths[idx].estimated += Number(l.estimatedAmount || 0);
      forecastMonths[idx].count += 1;
    }
  });

  const maxForecast = Math.max(...forecastMonths.map((fm) => fm.estimated), 1);

  // FY label helper
  const fyLabel = (fy: number) => {
    if (fyEndMonth === 12 && fyEndDay === 31) return `${fy}`; // calendar year
    return `FY ${fy - 1}/${String(fy).slice(2)}`;
  };

  const statusColors: Record<string, string> = {
    NOTIFIED: "bg-blue-100 text-blue-800",
    INVESTIGATING: "bg-yellow-100 text-yellow-800",
    PROBATE: "bg-yellow-100 text-yellow-800",
    AWAITING_PAYMENT: "bg-orange-100 text-orange-800",
    RECEIVED: "bg-green-100 text-green-800",
    PARTIAL: "bg-purple-100 text-purple-800",
    DISPUTED: "bg-red-100 text-red-800",
    CLOSED: "bg-gray-100 text-gray-800",
  };

  const fmt = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Legacies</h1>
          <p className="text-gray-500 mt-1">Track and manage legacy gifts and bequests</p>
        </div>
        <Link href="/finance/legacies/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Legacy
          </Button>
        </Link>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Banknote className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Total Received</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalReceived)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <PiggyBank className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Pipeline Forecast</p>
              <p className="text-lg font-bold text-gray-900">{fmt(pipelineValue)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Clock className="h-4 w-4 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">In Administration</p>
              <p className="text-lg font-bold text-gray-900">{inAdministration}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Heart className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Newly Notified</p>
              <p className="text-lg font-bold text-gray-900">{notified}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">{fyLabel(currentFY)} vs {fyLabel(currentFY - 1)}</p>
              <p className="text-lg font-bold text-gray-900">
                {fmt(thisFY.receivedValue)}
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

      {/* Search and filters — now right under stats */}
      <Card className="p-4">
        <form className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Search by deceased name, solicitor, or firm..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Status</option>
            <option value="NOTIFIED">Notified</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="PROBATE">Probate</option>
            <option value="AWAITING_PAYMENT">Awaiting Payment</option>
            <option value="RECEIVED">Received</option>
            <option value="PARTIAL">Partial</option>
            <option value="DISPUTED">Disputed</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select
            name="year"
            defaultValue={yearFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Years</option>
            {financialYears.map((fy) => (
              <option key={fy} value={fy}>{fyLabel(fy)}</option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </Card>

      {/* Legacies table — now right under search, with deceased name prominent */}
      {legacies.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No legacies found"
          description="Get started by recording your first legacy gift."
          actionLabel="New Legacy"
          actionHref="/finance/legacies/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deceased Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expected Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notified
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Solicitor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {legacies.map((legacy) => (
                  <tr key={legacy.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/finance/legacies/${legacy.id}`}
                        className="text-indigo-600 hover:text-indigo-700 font-semibold text-base"
                      >
                        {legacy.deceasedName}
                      </Link>
                      {legacy.contact && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Contact: {legacy.contact.firstName} {legacy.contact.lastName}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-xs">
                      {legacy.type}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {legacy.estimatedAmount ? fmt(Number(legacy.estimatedAmount)) : "—"}
                      </div>
                      {legacy.receivedAmount ? (
                        <div className="text-xs text-green-600">
                          Received: {fmt(Number(legacy.receivedAmount))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <PipelineTimeline
                        steps={getLegacySteps(legacy)}
                        currentStepKey={
                          legacy.status === "DISPUTED" || legacy.status === "PARTIAL"
                            ? "AWAITING_PAYMENT"
                            : legacy.status
                        }
                        variant="legacy"
                        size="compact"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={statusColors[legacy.status] || ""}>{legacy.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {legacy.expectedPaymentDate ? (
                        <span className="font-medium text-indigo-600">{formatDate(legacy.expectedPaymentDate)}</span>
                      ) : (
                        <span className="text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-xs">
                      {formatDate(legacy.dateNotified)}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-xs">
                      {legacy.solicitorName || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Monthly Forecast — shows expected payments by month for budgeting */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Monthly Payment Forecast</h3>
              <p className="text-xs text-gray-500">Expected legacy receipts over the next 12 months — uses the expected payment date when set, otherwise estimates from pipeline status and historic averages</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pipelineLegacies.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No legacies in the pipeline to forecast.</p>
          ) : (
            <div className="space-y-3">
              {forecastMonths.map((fm) => (
                <div key={fm.label} className="flex items-center gap-3">
                  <div className="w-20 text-xs font-medium text-gray-600 text-right shrink-0">
                    {fm.label}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      {fm.estimated > 0 && (
                        <div
                          className="bg-gradient-to-r from-indigo-400 to-indigo-600 h-6 rounded-full transition-all flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(8, (fm.estimated / maxForecast) * 100)}%` }}
                        >
                          <span className="text-[10px] font-bold text-white whitespace-nowrap">
                            {fmt(fm.estimated)}
                          </span>
                        </div>
                      )}
                    </div>
                    {fm.count > 0 && (
                      <span className="text-xs text-gray-500 shrink-0 w-16">
                        {fm.count} {fm.count === 1 ? "legacy" : "legacies"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {avgMonths && (
                <p className="text-xs text-gray-500 mt-4 text-center">
                  Based on an average of {avgMonths} months from notification to receipt
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historic Year Comparison — now at the bottom */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">Year-on-Year Analysis</h3>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Financial Year</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Notified</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Est. Value</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Received</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Received Value</th>
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase pl-4">Comparison</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { fy: currentFY, stats: thisFY, label: `${fyLabel(currentFY)} (YTD)` },
                  { fy: currentFY - 1, stats: lastFY, label: fyLabel(currentFY - 1) },
                  { fy: currentFY - 2, stats: twoFYAgo, label: fyLabel(currentFY - 2) },
                ].map((row) => (
                  <tr key={row.fy} className="hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-900">{row.label}</td>
                    <td className="py-3 text-right text-gray-700">{row.stats.notified}</td>
                    <td className="py-3 text-right text-gray-700">{fmt(row.stats.estimatedValue)}</td>
                    <td className="py-3 text-right text-gray-700">{row.stats.receivedCount}</td>
                    <td className="py-3 text-right font-medium text-gray-900">{fmt(row.stats.receivedValue)}</td>
                    <td className="py-3 pl-4">
                      {row.stats.receivedValue > 0 && (
                        <div className="w-full bg-gray-100 rounded-full h-3 max-w-[120px]">
                          <div
                            className="bg-indigo-500 h-3 rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                (row.stats.receivedValue /
                                  Math.max(
                                    thisFY.receivedValue,
                                    lastFY.receivedValue,
                                    twoFYAgo.receivedValue,
                                    1
                                  )) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Forecast row */}
                <tr className="bg-indigo-50/50">
                  <td className="py-3 font-medium text-indigo-700">
                    Forecast Pipeline
                  </td>
                  <td className="py-3 text-right text-indigo-600">—</td>
                  <td className="py-3 text-right font-semibold text-indigo-700">{fmt(pipelineValue)}</td>
                  <td className="py-3 text-right text-indigo-600">—</td>
                  <td className="py-3 text-right text-indigo-600">—</td>
                  <td className="py-3 pl-4 text-xs text-indigo-500">
                    {avgMonths
                      ? `Avg. ${avgMonths} months to receipt`
                      : "No receipt data yet"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
