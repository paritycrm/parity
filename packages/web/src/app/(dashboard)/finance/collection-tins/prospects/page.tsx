import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ProspectsClient from "./prospects-client";

export default async function ProspectsPage() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: {
      catchmentPostcodes: true,
      charityDescription: true,
      googlePlacesApiKey: true,
      orgName: true,
      charityWebsite: true,
      charityWebsiteSummary: true,
    },
  });

  const catchment: string[] = settings?.catchmentPostcodes
    ? JSON.parse(settings.catchmentPostcodes)
    : [];

  const hasApiKey = !!settings?.googlePlacesApiKey;
  const hasDescription = !!settings?.charityDescription;

  // Get stats per category to show what's performing well
  const categoryStats = await prisma.tinLocation.groupBy({
    by: ["type"],
    where: { isActive: true },
    _count: { id: true },
  });

  // Get collection totals per type
  const allLocations = await prisma.tinLocation.findMany({
    where: { isActive: true },
    select: {
      type: true,
      tins: {
        where: { status: "DEPLOYED" },
        select: {
          movements: {
            where: { type: "COUNTED" },
            select: { amount: true },
          },
        },
      },
    },
  });

  // Aggregate by type
  const typeAgg: Record<string, { locations: number; tins: number; raised: number; collections: number }> = {};
  for (const loc of allLocations) {
    if (!typeAgg[loc.type]) typeAgg[loc.type] = { locations: 0, tins: 0, raised: 0, collections: 0 };
    typeAgg[loc.type].locations++;
    for (const tin of loc.tins) {
      typeAgg[loc.type].tins++;
      for (const mov of tin.movements) {
        if (mov.amount) {
          typeAgg[loc.type].raised += Number(mov.amount);
          typeAgg[loc.type].collections++;
        }
      }
    }
  }

  const categories = Object.entries(typeAgg)
    .map(([type, stats]) => ({
      type,
      ...stats,
      avgCollection: stats.collections > 0 ? stats.raised / stats.collections : 0,
    }))
    .sort((a, b) => b.raised - a.raised);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/collection-tins">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prospect Finder</h1>
          <p className="text-gray-500 mt-1">
            Find new businesses in your catchment area to host collection tins
          </p>
        </div>
      </div>

      {/* Performance by category */}
      {categories.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Performance by Category</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {categories.map((cat) => {
              const names: Record<string, string> = {
                PUB: "Pubs", RESTAURANT: "Restaurants", SHOP: "Shops",
                SCHOOL: "Schools", CHURCH: "Churches", OFFICE: "Offices", OTHER: "Other",
              };
              const icons: Record<string, string> = {
                PUB: "🍺", RESTAURANT: "🍽️", SHOP: "🛍️",
                SCHOOL: "🎓", CHURCH: "⛪", OFFICE: "🏢", OTHER: "📍",
              };
              return (
                <Card key={cat.type} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{icons[cat.type] || "📍"}</span>
                    <p className="text-sm font-semibold text-gray-900">{names[cat.type] || cat.type}</p>
                  </div>
                  <div className="space-y-1 text-xs text-gray-500">
                    <p>{cat.locations} locations, {cat.tins} tins</p>
                    {cat.raised > 0 && (
                      <p className="text-green-600 font-semibold">
                        £{cat.raised.toFixed(2)} raised (avg £{cat.avgCollection.toFixed(2)}/tin)
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <ProspectsClient
        catchment={catchment}
        hasApiKey={hasApiKey}
        hasDescription={hasDescription}
        orgName={settings?.orgName || null}
        charityDescription={settings?.charityDescription || null}
        categories={categories.map((c) => c.type)}
        initialWebsite={settings?.charityWebsite || null}
        initialWebsiteSummary={settings?.charityWebsiteSummary || null}
      />
    </div>
  );
}
