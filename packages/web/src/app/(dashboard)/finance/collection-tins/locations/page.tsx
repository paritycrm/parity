import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus, Search, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LocationsMap } from "@/components/ui/locations-map";

export default async function TinLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string; area?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || "";
  const typeFilter = params.type || "";
  const areaFilter = params.area || "";

  const locations = await prisma.tinLocation.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { address: { contains: search, mode: "insensitive" } },
                { postcodeArea: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        typeFilter ? { type: typeFilter } : {},
        areaFilter ? { postcodeArea: areaFilter } : {},
      ],
    },
    include: {
      tins: {
        include: {
          movements: {
            where: { type: "COUNTED", amount: { not: null } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Get distinct postcode areas for the filter
  const allAreas = await prisma.tinLocation.findMany({
    where: { postcodeArea: { not: null } },
    select: { postcodeArea: true },
    distinct: ["postcodeArea"],
    orderBy: { postcodeArea: "asc" },
  });
  const distinctAreas = allAreas.map((a) => a.postcodeArea).filter(Boolean) as string[];

  const locationsWithStats = locations.map((loc) => {
    const totalCollected = loc.tins.reduce(
      (sum, tin) =>
        sum + tin.movements.reduce((s, m) => s + Number(m.amount || 0), 0),
      0
    );
    const collectionCount = loc.tins.reduce(
      (sum, tin) => sum + tin.movements.length,
      0
    );
    const activeTins = loc.tins.filter((t) => t.status === "DEPLOYED").length;
    return { ...loc, totalCollected, collectionCount, activeTins, latitude: loc.latitude, longitude: loc.longitude };
  });

  const mapLocations = locationsWithStats.map((loc) => ({
    id: loc.id,
    name: loc.name,
    address: loc.address,
    type: loc.type,
    latitude: loc.latitude,
    longitude: loc.longitude,
    activeTins: loc.activeTins,
    totalCollected: loc.totalCollected,
  }));

  const typeColors: Record<string, string> = {
    SHOP: "bg-blue-100 text-blue-800",
    PUB: "bg-amber-100 text-amber-800",
    RESTAURANT: "bg-orange-100 text-orange-800",
    OFFICE: "bg-gray-100 text-gray-800",
    SCHOOL: "bg-green-100 text-green-800",
    CHURCH: "bg-purple-100 text-purple-800",
    OTHER: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tin Locations</h1>
          <p className="text-gray-500 mt-1">
            Manage locations where collection tins are placed
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance/collection-tins">
            <Button variant="outline">All Tins</Button>
          </Link>
          <Link href="/finance/collection-tins/reports">
            <Button variant="outline">Reports</Button>
          </Link>
          <Link href="/finance/collection-tins/locations/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-4">
        <form className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Search by name or address..."
              className="flex-1 border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="SHOP">Shop</option>
            <option value="PUB">Pub</option>
            <option value="RESTAURANT">Restaurant</option>
            <option value="OFFICE">Office</option>
            <option value="SCHOOL">School</option>
            <option value="CHURCH">Church</option>
            <option value="OTHER">Other</option>
          </select>
          {distinctAreas.length > 0 && (
            <select
              name="area"
              defaultValue={areaFilter}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All Areas</option>
              {distinctAreas.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          )}
          <Button type="submit" variant="outline" size="sm">
            Filter
          </Button>
        </form>
      </Card>

      {/* Map View */}
      {locationsWithStats.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              Location Map
            </h2>
            <span className="text-xs text-gray-500">
              ({mapLocations.filter((l) => l.latitude && l.longitude).length} of{" "}
              {mapLocations.length} mapped)
            </span>
          </div>
          <LocationsMap locations={mapLocations} />
        </Card>
      )}

      {locationsWithStats.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No locations found"
          description="Add your first tin location to start tracking."
          actionLabel="Add Location"
          actionHref="/finance/collection-tins/locations/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Area
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Active Tins
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Collections
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Collected
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {locationsWithStats.map((loc) => (
                  <tr
                    key={loc.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/finance/collection-tins/locations/${loc.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {loc.name}
                      </Link>
                      {loc.address && (
                        <p className="text-xs text-gray-500">{loc.address}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {loc.postcodeArea ? (
                        <span className="text-sm font-medium text-indigo-600">{loc.postcodeArea}</span>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={typeColors[loc.type] || ""}>
                        {loc.type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {loc.activeTins}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {loc.collectionCount}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                      £{loc.totalCollected.toFixed(2)}
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
