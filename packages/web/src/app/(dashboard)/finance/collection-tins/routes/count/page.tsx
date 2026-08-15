import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  ArrowLeft,
  Coins,
  Package,
  MapPin,
  Calendar,
  CheckCircle,
  AlertCircle,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";

export default async function CountTinsPage() {
  // Get completed runs that have uncounted tins
  const completedRuns = await prisma.collectionRun.findMany({
    where: {
      status: "COMPLETED",
    },
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
      tinReturns: true,
    },
    orderBy: { completedAt: "desc" },
  });

  // Separate into needs-counting and fully-counted
  const runsWithCounts = completedRuns.map((run) => {
    const collectedTins = run.runStops
      .filter((s) => s.status === "COMPLETED" && s.collectedTin)
      .map((s) => s.collectedTin!);
    const totalCollected = collectedTins.length;

    const countedTinIds = new Set(run.tinReturns.map((r) => r.tinId));
    const uncountedTins = collectedTins.filter((t) => !countedTinIds.has(t.id));
    const countedTins = collectedTins.filter((t) => countedTinIds.has(t.id));
    const totalCounted = run.tinReturns.reduce((sum, r) => sum + Number(r.amount), 0);

    return {
      ...run,
      totalCollected,
      uncountedTins,
      countedTinsCount: countedTins.length,
      totalCounted,
      isFullyCounted: uncountedTins.length === 0 && totalCollected > 0,
      needsCounting: uncountedTins.length > 0,
    };
  });

  const needsCounting = runsWithCounts.filter((r) => r.needsCounting);
  const fullyCounted = runsWithCounts.filter((r) => r.isFullyCounted);

  const totalUncounted = needsCounting.reduce(
    (sum, r) => sum + r.uncountedTins.length,
    0
  );
  const totalCountedToday = await prisma.tinReturn.aggregate({
    where: {
      returnedAt: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/finance/collection-tins/routes">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Routes
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Coins className="h-6 w-6 text-amber-600" />
            Count Tins
          </h1>
          <p className="text-gray-500 mt-1">
            Scan and count returned tins from completed runs
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Runs to Process</p>
          <p className="text-2xl font-bold text-amber-600">
            {needsCounting.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Tins Awaiting Count</p>
          <p className="text-2xl font-bold text-red-600">{totalUncounted}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Counted Today</p>
          <p className="text-2xl font-bold">
            {totalCountedToday._count.id || 0}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Today&apos;s Total</p>
          <p className="text-2xl font-bold text-green-600">
            £{(totalCountedToday._sum.amount || 0).toFixed(2)}
          </p>
        </Card>
      </div>

      {/* Runs needing counting */}
      {needsCounting.length === 0 && fullyCounted.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No completed runs to count"
          description="Once a collection run is completed, it will appear here for tin counting."
        />
      ) : (
        <>
          {needsCounting.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Needs Counting ({needsCounting.length})
              </h2>
              <div className="space-y-3">
                {needsCounting.map((run) => (
                  <Card
                    key={run.id}
                    className="p-5 border-l-4 border-l-amber-400"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-gray-900 text-lg">
                            {run.route.name}
                          </h3>
                          <Badge className="bg-amber-100 text-amber-800">
                            {run.uncountedTins.length} uncounted
                          </Badge>
                          {run.countedTinsCount > 0 && (
                            <Badge className="bg-green-100 text-green-800">
                              {run.countedTinsCount} done
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {run.totalCollected} tins collected
                          </span>
                          {run.completedAt && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(run.completedAt)}
                            </span>
                          )}
                          {run.assignedTo && (
                            <span className="flex items-center gap-1">
                              <User className="h-3.5 w-3.5" />
                              {run.assignedTo.contact.firstName}{" "}
                              {run.assignedTo.contact.lastName}
                            </span>
                          )}
                          {run.totalCounted > 0 && (
                            <span className="text-green-600 font-medium">
                              £{run.totalCounted.toFixed(2)} counted so far
                            </span>
                          )}
                        </div>
                        {/* Show uncounted tin numbers */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {run.uncountedTins.map((tin) => (
                            <span
                              key={tin.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700"
                            >
                              {tin.tinNumber}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="ml-4">
                        <Link
                          href={`/finance/collection-tins/routes/count/${run.id}`}
                        >
                          <Button>
                            <Coins className="h-4 w-4 mr-2" />
                            Start Counting
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {fullyCounted.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Fully Counted ({fullyCounted.length})
              </h2>
              <div className="space-y-3">
                {fullyCounted.map((run) => (
                  <Card key={run.id} className="p-4 border-l-4 border-l-green-400">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-gray-900">
                            {run.route.name}
                          </h3>
                          <Badge className="bg-green-100 text-green-800">
                            All counted
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span>
                            {run.totalCollected} tins · £
                            {run.totalCounted.toFixed(2)} total
                          </span>
                          {run.completedAt && (
                            <span>{formatDate(run.completedAt)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/finance/collection-tins/routes/count/${run.id}/report`}
                        >
                          <Button variant="outline" size="sm">
                            View Report
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
