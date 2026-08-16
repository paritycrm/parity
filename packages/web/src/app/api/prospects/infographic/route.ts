import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { category } = await request.json();
  if (!category) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }

  // Get charity settings
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: {
      orgName: true,
      primaryColour: true,
      charityDescription: true,
      logoUrl: true,
    },
  });

  // Get stats for this category
  const locations = await prisma.tinLocation.findMany({
    where: { isActive: true, type: category },
    include: {
      tins: {
        where: { status: "DEPLOYED" },
        include: {
          movements: {
            where: { type: "COUNTED" },
            select: { amount: true, date: true },
          },
        },
      },
    },
  });

  const totalLocations = locations.length;
  const totalTins = locations.reduce((s, l) => s + l.tins.length, 0);

  // Calculate average collection amount across all tins of this type
  let totalCollections = 0;
  let collectionCount = 0;
  for (const loc of locations) {
    for (const tin of loc.tins) {
      for (const mov of tin.movements) {
        if (mov.amount) {
          totalCollections += Number(mov.amount);
          collectionCount++;
        }
      }
    }
  }
  const avgCollection = collectionCount > 0 ? totalCollections / collectionCount : 0;
  const totalRaised = totalCollections;

  // Get all categories for comparison
  const allCategories = await prisma.tinLocation.groupBy({
    by: ["type"],
    where: { isActive: true },
    _count: { id: true },
  });

  // Format the category name for display
  const categoryNames: Record<string, string> = {
    PUB: "Pubs",
    RESTAURANT: "Restaurants & Cafes",
    SHOP: "Shops & Retail",
    SCHOOL: "Schools",
    CHURCH: "Churches",
    OFFICE: "Offices",
    OTHER: "Other Locations",
  };

  const categoryName = categoryNames[category] || category;
  const orgName = settings?.orgName || "Our Charity";
  const primaryColour = settings?.primaryColour || "#4f46e5";
  const charityDescription = settings?.charityDescription || "";

  // Return the data needed to render the infographic — the frontend will
  // call the /api/prospects/infographic/pdf endpoint to actually generate it
  return NextResponse.json({
    orgName,
    primaryColour,
    charityDescription,
    categoryName,
    category,
    stats: {
      totalLocations,
      totalTins,
      avgCollection: Math.round(avgCollection * 100) / 100,
      totalRaised: Math.round(totalRaised * 100) / 100,
      collectionCount,
    },
    allCategories: allCategories.map((c) => ({
      type: c.type,
      name: categoryNames[c.type] || c.type,
      count: c._count.id,
    })),
  });
}
