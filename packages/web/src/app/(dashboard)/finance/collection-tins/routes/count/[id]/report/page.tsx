import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RouteInfographic } from "./infographic";

export default async function RunReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const run = await prisma.collectionRun.findUnique({
    where: { id },
    include: {
      route: true,
      runStops: {
        include: {
          routeStop: { include: { location: true } },
          collectedTin: true,
        },
        orderBy: { routeStop: { sortOrder: "asc" } },
      },
      assignedTo: { include: { contact: true } },
      createdBy: true,
      tinReturns: {
        include: { tin: true },
        orderBy: { returnedAt: "asc" },
      },
    },
  });

  if (!run) notFound();

  // Compute stats
  const completedRunStops = run.runStops.filter((s) => s.status === "COMPLETED");
  const skippedRunStops = run.runStops.filter((s) => s.status === "SKIPPED");
  const amounts = run.tinReturns.map((r) => Number(r.amount));
  const totalCollected = amounts.reduce((a, b) => a + b, 0);
  const avgPerTin = amounts.length > 0 ? totalCollected / amounts.length : 0;
  const highestTin = run.tinReturns.reduce(
    (best, r) =>
      Number(r.amount) > Number(best?.amount || 0) ? r : best,
    null as (typeof run.tinReturns)[0] | null
  );
  const lowestTin =
    amounts.length > 0
      ? run.tinReturns.reduce(
          (worst, r) => (Number(r.amount) < Number(worst.amount) ? r : worst),
          run.tinReturns[0]
        )
      : null;

  // Time stats
  const durationMs =
    run.startedAt && run.completedAt
      ? run.completedAt.getTime() - run.startedAt.getTime()
      : null;
  const durationHours = durationMs ? durationMs / (1000 * 60 * 60) : null;

  // Location type breakdown
  const typeBreakdown: Record<string, { count: number; total: number }> = {};
  for (const runStop of completedRunStops) {
    const locType = runStop.routeStop.location.type || "OTHER";
    if (!typeBreakdown[locType]) typeBreakdown[locType] = { count: 0, total: 0 };
    typeBreakdown[locType].count++;
    const tinReturn = run.tinReturns.find(
      (r) => r.tinId === runStop.collectedTin?.id
    );
    if (tinReturn) typeBreakdown[locType].total += Number(tinReturn.amount);
  }

  // Amount distribution for chart
  const distribution = amounts.map((a, i) => ({
    stopNumber: i + 1,
    amount: a,
    tinNumber: run.tinReturns[i]?.tin.tinNumber || "",
    location:
      completedRunStops[i]?.routeStop.location.name ||
      run.tinReturns[i]?.tin.locationName ||
      "",
  }));

  // Top 5 earners
  const topEarners = [...run.tinReturns]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5)
    .map((r) => {
      const runStop = completedRunStops.find((s) => s.collectedTin?.id === r.tinId);
      return {
        tinNumber: r.tin.tinNumber,
        amount: Number(r.amount),
        location: runStop?.routeStop.location.name || r.tin.locationName,
        type: runStop?.routeStop.location.type || "OTHER",
      };
    });

  const stats = {
    routeName: run.route.name,
    routeDescription: run.route.description,
    completedDate: run.completedAt?.toISOString() || null,
    startedDate: run.startedAt?.toISOString() || null,
    volunteer: run.assignedTo
      ? `${run.assignedTo.contact.firstName} ${run.assignedTo.contact.lastName}`
      : null,
    totalStops: run.runStops.length,
    completedStops: completedRunStops.length,
    skippedStops: skippedRunStops.length,
    totalTinsCounted: amounts.length,
    totalCollected,
    avgPerTin: Math.round(avgPerTin * 100) / 100,
    highestAmount: Number(highestTin?.amount || 0),
    highestTinNumber: highestTin?.tin.tinNumber || "",
    lowestAmount: Number(lowestTin?.amount || 0),
    lowestTinNumber: lowestTin?.tin.tinNumber || "",
    durationHours: durationHours ? Math.round(durationHours * 10) / 10 : null,
    typeBreakdown: Object.entries(typeBreakdown).map(([type, data]) => ({
      type,
      count: data.count,
      total: Math.round(data.total * 100) / 100,
      avg: Math.round((data.total / data.count) * 100) / 100,
    })),
    distribution,
    topEarners,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/finance/collection-tins/routes/count/${run.id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Count
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Run Report</h1>
            <p className="text-gray-500 mt-1">{run.route.name}</p>
          </div>
        </div>
      </div>

      <RouteInfographic stats={stats} />
    </div>
  );
}
