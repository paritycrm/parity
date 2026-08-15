import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Coins, ScanBarcode, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { processReturn } from "../../actions";

export default async function CountRunSessionPage({
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
      tinReturns: {
        include: { tin: true },
        orderBy: { returnedAt: "desc" },
      },
      assignedTo: { include: { contact: true } },
    },
  });

  if (!run || run.status !== "COMPLETED") notFound();

  const collectedTins = run.runStops
    .filter((s) => s.status === "COMPLETED" && s.collectedTin)
    .map((s) => ({
      tin: s.collectedTin!,
      location: s.routeStop.location,
    }));

  const countedTinIds = new Set(run.tinReturns.map((r) => r.tinId));
  const uncounted = collectedTins.filter((t) => !countedTinIds.has(t.tin.id));
  const counted = collectedTins.filter((t) => countedTinIds.has(t.tin.id));
  const totalCounted = run.tinReturns.reduce((sum, r) => sum + Number(r.amount), 0);

  const allDone = uncounted.length === 0 && collectedTins.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/finance/collection-tins/routes/count">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Count Tins
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Coins className="h-6 w-6 text-amber-600" />
              Counting: {run.route.name}
            </h1>
            <p className="text-gray-500 mt-1">
              {uncounted.length} remaining · {counted.length} counted · £
              {totalCounted.toFixed(2)} so far
            </p>
          </div>
        </div>
        {allDone && (
          <Link href={`/finance/collection-tins/routes/count/${run.id}/report`}>
            <Button>
              <CheckCircle className="h-4 w-4 mr-2" />
              View Report
            </Button>
          </Link>
        )}
      </div>

      {/* Progress bar */}
      <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className="bg-green-500 h-full rounded-full transition-all"
          style={{
            width: `${collectedTins.length > 0 ? (counted.length / collectedTins.length) * 100 : 0}%`,
          }}
        />
      </div>
      <p className="text-sm text-gray-500 text-center">
        {counted.length} of {collectedTins.length} tins counted
      </p>

      {/* Scan form */}
      {!allDone && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <ScanBarcode className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Scan or Enter Tin</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Scan a barcode or type the tin number. The amount will be linked to
            this run automatically.
          </p>
          <form action={processReturn} className="space-y-4">
            <input type="hidden" name="runId" value={run.id} />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Input
                  label="Tin Number"
                  name="tinNumber"
                  required
                  placeholder="Scan barcode or type..."
                  autoFocus
                />
              </div>
              <div>
                <Input
                  label="Amount (£)"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  name="notes"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Any notes..."
                />
              </div>
            </div>
            <Button type="submit">
              <Coins className="h-4 w-4 mr-2" />
              Count Tin
            </Button>
          </form>
        </Card>
      )}

      {allDone && (
        <Card className="p-8 text-center border-green-200 bg-green-50">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-green-800 mb-1">
            All Tins Counted!
          </h2>
          <p className="text-green-700 mb-1">
            {counted.length} tins · Total: £{totalCounted.toFixed(2)}
          </p>
          <p className="text-sm text-green-600 mb-4">
            Average per tin: £
            {counted.length > 0
              ? (totalCounted / counted.length).toFixed(2)
              : "0.00"}
          </p>
          <Link href={`/finance/collection-tins/routes/count/${run.id}/report`}>
            <Button size="lg">View Run Report</Button>
          </Link>
        </Card>
      )}

      {/* Uncounted tins */}
      {uncounted.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Awaiting Count ({uncounted.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {uncounted.map(({ tin, location }) => (
              <div
                key={tin.id}
                className="p-3 border border-amber-200 bg-amber-50 rounded-lg"
              >
                <p className="font-mono font-bold text-amber-800">
                  {tin.tinNumber}
                </p>
                <p className="text-sm text-gray-600 truncate">{location.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {location.postcode}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Already counted */}
      {run.tinReturns.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Counted ({run.tinReturns.length})
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2">Tin</th>
                <th className="pb-2">Amount</th>
                <th className="pb-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {run.tinReturns.map((ret) => (
                <tr key={ret.id} className="border-b last:border-0">
                  <td className="py-2 font-mono">{ret.tin.tinNumber}</td>
                  <td className="py-2 font-medium text-green-600">
                    £{ret.amount.toFixed(2)}
                  </td>
                  <td className="py-2 text-gray-500">
                    {formatDate(ret.returnedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
