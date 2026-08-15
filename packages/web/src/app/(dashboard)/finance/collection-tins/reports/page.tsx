import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, TrendingUp, MapPin, Award } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function CollectionTinsReportsPage() {
  // Get all locations with their tins and collection movements
  const locations = await prisma.tinLocation.findMany({
    include: {
      tins: {
        include: {
          movements: {
            where: { type: "COUNTED", amount: { not: null } },
            orderBy: { date: "desc" },
          },
        },
      },
    },
  });

  // Also get tins without locations that have collections
  const unlinkedTins = await prisma.collectionTin.findMany({
    where: { locationId: null },
    include: {
      movements: {
        where: { type: "COUNTED", amount: { not: null } },
        orderBy: { date: "desc" },
      },
    },
  });

  // Build location stats
  const locationStats = locations
    .map((loc) => {
      const allMovements = loc.tins.flatMap((t) => t.movements);
      const totalCollected = allMovements.reduce(
        (s, m) => s + Number(m.amount || 0),
        0
      );
      const collectionCount = allMovements.length;
      const avgPerCollection =
        collectionCount > 0 ? totalCollected / collectionCount : 0;
      const activeTins = loc.tins.filter(
        (t) => t.status === "DEPLOYED"
      ).length;
      const lastCollection = allMovements[0];
      return {
        id: loc.id,
        name: loc.name,
        type: loc.type,
        postcodeArea: loc.postcodeArea,
        isActive: loc.isActive,
        totalCollected,
        collectionCount,
        avgPerCollection,
        activeTins,
        totalTins: loc.tins.length,
        lastCollectionDate: lastCollection?.date || null,
      };
    })
    .sort((a, b) => b.totalCollected - a.totalCollected);

  // Overall stats
  const grandTotal = locationStats.reduce(
    (s, l) => s + l.totalCollected,
    0
  );
  const unlinkedTotal = unlinkedTins.reduce(
    (s, t) => s + t.movements.reduce((ss, m) => ss + Number(m.amount || 0), 0),
    0
  );
  const totalCollections = locationStats.reduce(
    (s, l) => s + l.collectionCount,
    0
  );
  const totalActiveTins = locationStats.reduce(
    (s, l) => s + l.activeTins,
    0
  );

  // Monthly breakdown - last 12 months
  const allMovements = locations
    .flatMap((l) => l.tins.flatMap((t) => t.movements))
    .concat(unlinkedTins.flatMap((t) => t.movements));

  const monthlyData: Record<string, number> = {};
  allMovements.forEach((m) => {
    const d = new Date(m.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyData[key] = (monthlyData[key] || 0) + Number(m.amount || 0);
  });

  const sortedMonths = Object.entries(monthlyData)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12);

  // Area-based stats (postcode area grouping)
  const areaStats: Record<string, { total: number; locationCount: number; collectionCount: number; activeTins: number }> = {};
  locationStats.forEach((loc) => {
    const area = loc.postcodeArea || null;
    if (!area) return;
    if (!areaStats[area]) {
      areaStats[area] = { total: 0, locationCount: 0, collectionCount: 0, activeTins: 0 };
    }
    areaStats[area].total += loc.totalCollected;
    areaStats[area].locationCount += 1;
    areaStats[area].collectionCount += loc.collectionCount;
    areaStats[area].activeTins += loc.activeTins;
  });

  const areaRanking = Object.entries(areaStats)
    .map(([area, data]) => ({
      area,
      ...data,
      avgPerLocation: data.locationCount > 0 ? data.total / data.locationCount : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Top performing by type
  const typeStats: Record<string, { total: number; count: number }> = {};
  locationStats.forEach((loc) => {
    if (!typeStats[loc.type]) {
      typeStats[loc.type] = { total: 0, count: 0 };
    }
    typeStats[loc.type].total += loc.totalCollected;
    typeStats[loc.type].count += 1;
  });

  const typeRanking = Object.entries(typeStats)
    .map(([type, data]) => ({
      type,
      total: data.total,
      avgPerLocation: data.count > 0 ? data.total / data.count : 0,
      locationCount: data.count,
    }))
    .sort((a, b) => b.total - a.total);

  const typeColors: Record<string, string> = {
    SHOP: "bg-blue-100 text-blue-800",
    PUB: "bg-amber-100 text-amber-800",
    RESTAURANT: "bg-orange-100 text-orange-800",
    OFFICE: "bg-gray-100 text-gray-800",
    SCHOOL: "bg-green-100 text-green-800",
    CHURCH: "bg-purple-100 text-purple-800",
    OTHER: "bg-gray-100 text-gray-800",
  };

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/finance/collection-tins"
            className="text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Collection Tins Reports
            </h1>
            <p className="text-gray-500 mt-1">
              Performance analysis by location
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/finance/collection-tins/locations">
            <Button variant="outline">
              <MapPin className="h-4 w-4 mr-2" />
              Locations
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">
              £{(grandTotal + unlinkedTotal).toFixed(2)}
            </p>
            <p className="text-sm text-gray-500 mt-1">Total Collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-indigo-600">
              {locationStats.length}
            </p>
            <p className="text-sm text-gray-500 mt-1">Locations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-amber-600">
              {totalActiveTins}
            </p>
            <p className="text-sm text-gray-500 mt-1">Active Tins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-purple-600">
              {totalCollections}
            </p>
            <p className="text-sm text-gray-500 mt-1">Total Collections</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Locations */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Top Locations by Revenue
              </h3>
            </div>
          </CardHeader>
          <CardContent>
            {locationStats.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No location data yet
              </p>
            ) : (
              <div className="space-y-3">
                {locationStats.slice(0, 10).map((loc, i) => {
                  const maxTotal = locationStats[0]?.totalCollected || 1;
                  const barWidth = (loc.totalCollected / maxTotal) * 100;
                  return (
                    <div key={loc.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-400 w-6">
                            {i + 1}.
                          </span>
                          <Link
                            href={`/finance/collection-tins/locations/${loc.id}`}
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            {loc.name}
                          </Link>
                          <Badge
                            className={`text-xs ${typeColors[loc.type] || ""}`}
                          >
                            {loc.type}
                          </Badge>
                        </div>
                        <span className="text-sm font-bold text-gray-900">
                          £{loc.totalCollected.toFixed(2)}
                        </span>
                      </div>
                      <div className="ml-8 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-400 rounded-full"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <div className="ml-8 flex gap-4 text-xs text-gray-500 mt-1">
                        <span>{loc.collectionCount} collections</span>
                        <span>
                          £{loc.avgPerCollection.toFixed(2)} avg
                        </span>
                        <span>{loc.activeTins} active tins</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance by Type */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Performance by Location Type
              </h3>
            </div>
          </CardHeader>
          <CardContent>
            {typeRanking.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No data yet
              </p>
            ) : (
              <div className="space-y-4">
                {typeRanking.map((t) => (
                  <div
                    key={t.type}
                    className="p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={typeColors[t.type] || ""}>
                        {t.type}
                      </Badge>
                      <span className="text-lg font-bold text-gray-900">
                        £{t.total.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>{t.locationCount} locations</span>
                      <span>
                        £{t.avgPerLocation.toFixed(2)} avg/location
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Postcode Area */}
        {areaRanking.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-green-500" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Revenue by Postcode Area
                </h3>
              </div>
              <p className="text-sm text-gray-500">
                How generous is each area? Locations grouped by postcode sector.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Area
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Total Collected
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Locations
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Active Tins
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Collections
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Avg / Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {areaRanking.map((a) => {
                      const maxArea = areaRanking[0]?.total || 1;
                      const barWidth = (a.total / maxArea) * 100;
                      return (
                        <tr key={a.area} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/finance/collection-tins/locations?area=${encodeURIComponent(a.area)}`}
                                className="text-sm font-bold text-indigo-600 hover:underline"
                              >
                                {a.area}
                              </Link>
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[100px]">
                                <div
                                  className="h-full bg-green-400 rounded-full"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">
                            £{a.total.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {a.locationCount}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {a.activeTins}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {a.collectionCount}
                          </td>
                          <td className="px-4 py-3 text-sm text-amber-600 font-medium text-right">
                            £{a.avgPerLocation.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">
              Monthly Collections
            </h3>
          </CardHeader>
          <CardContent>
            {sortedMonths.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No collection data yet
              </p>
            ) : (
              <div className="space-y-2">
                {sortedMonths.map(([month, total]) => {
                  const [year, m] = month.split("-");
                  const maxMonthly =
                    Math.max(...sortedMonths.map(([, t]) => t)) || 1;
                  const barWidth = (total / maxMonthly) * 100;
                  return (
                    <div key={month} className="flex items-center gap-4">
                      <span className="text-sm text-gray-600 w-24">
                        {monthNames[parseInt(m) - 1]} {year}
                      </span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-400 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(barWidth, 10)}%` }}
                        >
                          <span className="text-xs font-medium text-white">
                            £{total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Best Performing - Avg per Collection */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">
            Best Average per Collection
          </h3>
          <p className="text-sm text-gray-500">
            Locations ranked by average amount per collection (minimum 2 collections)
          </p>
        </CardHeader>
        <CardContent>
          {(() => {
            const qualifying = locationStats
              .filter((l) => l.collectionCount >= 2)
              .sort((a, b) => b.avgPerCollection - a.avgPerCollection);

            if (qualifying.length === 0) {
              return (
                <p className="text-sm text-gray-500 text-center py-4">
                  Need at least 2 collections at a location to show averages
                </p>
              );
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Rank
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Location
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Avg/Collection
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Collections
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {qualifying.map((loc, i) => (
                      <tr key={loc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-bold text-gray-400">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/finance/collection-tins/locations/${loc.id}`}
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            {loc.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={typeColors[loc.type] || ""}
                          >
                            {loc.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">
                          £{loc.avgPerCollection.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {loc.collectionCount}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                          £{loc.totalCollected.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
