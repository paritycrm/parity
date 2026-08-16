"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { geocodeAddress } from "@/lib/geocode";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Haversine distance in miles
function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type SuggestedStop = {
  locationId: string;
  name: string;
  address: string | null;
  postcode: string | null;
  type: string;
  lat: number;
  lng: number;
  distanceFromPrev: number; // miles from previous stop
  totalDistance: number; // cumulative miles
  avgCollected: number; // avg £ per collection
  daysSinceLastCollection: number;
  deployedTins: number;
  priorityScore: number;
  stopNumber: number;
  parkingNotes: string | null;
};

export type SuggestedRoute = {
  stops: SuggestedStop[];
  totalDistanceMiles: number;
  estimatedTimeMinutes: number;
  estimatedTotalCollection: number;
  startLat: number;
  startLng: number;
  startPostcode: string;
};

export async function suggestRoute(formData: FormData): Promise<SuggestedRoute | null> {
  const session = await getSession();
  if (!session) redirect("/login");

  const startPostcode = (formData.get("startPostcode") as string)?.trim();
  const maxTins = parseInt(formData.get("maxTins") as string) || 50;
  const availableHours = parseFloat(formData.get("availableHours") as string) || 4;

  if (!startPostcode) return null;

  // 1. Geocode starting point
  const startCoords = await geocodeAddress(startPostcode);
  if (!startCoords) return null;

  // 2. Fetch all active locations with coordinates
  const locations = await prisma.tinLocation.findMany({
    where: {
      isActive: true,
      latitude: { not: null },
      longitude: { not: null },
    },
    include: {
      tins: {
        where: { status: "DEPLOYED" },
        include: {
          movements: {
            where: { type: "COUNTED", amount: { not: null } },
            orderBy: { date: "desc" },
          },
        },
      },
    },
  });

  // 3. Calculate intelligence for each location
  const now = new Date();
  const locationData = locations.map((loc) => {
    const allMovements = loc.tins.flatMap((t) => t.movements);
    const amounts = allMovements
      .filter((m) => m.amount !== null)
      .map((m) => Number(m.amount!));
    const avgCollected =
      amounts.length > 0
        ? amounts.reduce((a, b) => a + b, 0) / amounts.length
        : 0;

    const lastCollectionDate =
      allMovements.length > 0
        ? new Date(
            Math.max(
              ...allMovements.map((m) => m.date.getTime())
            )
          )
        : null;
    const daysSinceLastCollection = lastCollectionDate
      ? Math.floor(
          (now.getTime() - lastCollectionDate.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 999; // Never collected = high priority

    const distanceFromStart = haversine(
      startCoords.lat,
      startCoords.lng,
      loc.latitude!,
      loc.longitude!
    );

    // Priority: higher = should visit sooner
    // Factors: more days since last collection, higher avg amount, shorter distance
    const priorityScore =
      distanceFromStart > 0
        ? (daysSinceLastCollection * Math.max(avgCollected, 1)) /
          distanceFromStart
        : 0;

    return {
      locationId: loc.id,
      name: loc.name,
      address: loc.address,
      postcode: loc.postcode,
      type: loc.type,
      lat: loc.latitude!,
      lng: loc.longitude!,
      notes: loc.notes,
      avgCollected,
      daysSinceLastCollection,
      deployedTins: loc.tins.length,
      priorityScore,
      distanceFromStart,
    };
  });

  // 4. Nearest-neighbour route building with time budget
  const availableMinutes = availableHours * 60;
  const MINUTES_PER_STOP = 5; // time to swap a tin
  const MINUTES_PER_MILE = 3; // rough driving estimate (~20 mph avg in town)

  const unvisited = [...locationData];
  const route: SuggestedStop[] = [];
  let currentLat = startCoords.lat;
  let currentLng = startCoords.lng;
  let totalDistance = 0;
  let totalTime = 0;

  while (unvisited.length > 0 && route.length < maxTins) {
    // Find nearest unvisited location
    let nearestIdx = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = haversine(
        currentLat,
        currentLng,
        unvisited[i].lat,
        unvisited[i].lng
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    if (nearestIdx === -1) break;

    // Check if adding this stop would exceed time budget
    const timeForThisStop =
      MINUTES_PER_STOP + nearestDist * MINUTES_PER_MILE;
    // Also need to account for return journey
    const returnDistance = haversine(
      unvisited[nearestIdx].lat,
      unvisited[nearestIdx].lng,
      startCoords.lat,
      startCoords.lng
    );
    const returnTime = returnDistance * MINUTES_PER_MILE;

    if (
      totalTime + timeForThisStop + returnTime > availableMinutes &&
      route.length > 0
    ) {
      break; // Would exceed time budget
    }

    const loc = unvisited.splice(nearestIdx, 1)[0];
    totalDistance += nearestDist;
    totalTime += timeForThisStop;

    route.push({
      locationId: loc.locationId,
      name: loc.name,
      address: loc.address,
      postcode: loc.postcode,
      type: loc.type,
      lat: loc.lat,
      lng: loc.lng,
      distanceFromPrev: nearestDist,
      totalDistance,
      avgCollected: loc.avgCollected,
      daysSinceLastCollection: loc.daysSinceLastCollection,
      deployedTins: loc.deployedTins,
      priorityScore: loc.priorityScore,
      stopNumber: route.length + 1,
      parkingNotes: loc.notes,
    });

    currentLat = loc.lat;
    currentLng = loc.lng;
  }

  // Add return distance
  if (route.length > 0) {
    const lastStop = route[route.length - 1];
    const returnDist = haversine(
      lastStop.lat,
      lastStop.lng,
      startCoords.lat,
      startCoords.lng
    );
    totalDistance += returnDist;
    totalTime += returnDist * MINUTES_PER_MILE;
  }

  return {
    stops: route,
    totalDistanceMiles: Math.round(totalDistance * 10) / 10,
    estimatedTimeMinutes: Math.round(totalTime),
    estimatedTotalCollection: route.reduce((sum, s) => sum + s.avgCollected, 0),
    startLat: startCoords.lat,
    startLng: startCoords.lng,
    startPostcode,
  };
}

export async function createRouteFromSuggestion(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;
  const tinCount = parseInt(formData.get("tinCount") as string) || 0;
  const assignedToId = (formData.get("assignedToId") as string) || null;
  const stopsJson = formData.get("stops") as string;

  const stops: { locationId: string; parkingNotes: string | null }[] =
    JSON.parse(stopsJson);

  const route = await prisma.collectionRoute.create({
    data: {
      name,
      description,
      tinCount,
      assignedToId: assignedToId || null,
      createdById: session.id,
      source: "SUGGESTED",
      stops: {
        create: stops.map((stop, index) => ({
          locationId: stop.locationId,
          sortOrder: index,
          parkingNotes: stop.parkingNotes,
        })),
      },
    },
  });

  await logAudit({
    userId: session.id,
    action: "CREATE",
    entityType: "CollectionRoute",
    entityId: route.id,
    details: {
      name,
      tinCount,
      stopsCount: stops.length,
      source: "SUGGESTED",
    },
  });

  redirect(`/finance/collection-tins/routes/${route.id}`);
}
