import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export type LetterData = {
  prospectName: string;
  prospectAddress: string;
  category: string;
  letterBody: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  PUB: "pub", RESTAURANT: "restaurant", SHOP: "shop",
  SCHOOL: "school", CHURCH: "church", OFFICE: "office", OTHER: "business",
};

const CATEGORY_CUSTOMER_WORDS: Record<string, string> = {
  PUB: "customers and regulars", RESTAURANT: "diners and visitors",
  SHOP: "shoppers and customers", SCHOOL: "staff, parents and students",
  CHURCH: "congregation and visitors", OFFICE: "staff and visitors",
  OTHER: "customers and visitors",
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { prospects } = await request.json();
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return NextResponse.json({ error: "prospects array is required" }, { status: 400 });
  }

  // Get charity settings
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: {
      orgName: true,
      charityDescription: true,
      charityWebsite: true,
      charityWebsiteSummary: true,
      headOfficeAddress: true,
      primaryColour: true,
    },
  });

  const orgName = settings?.orgName || "Our Charity";
  const description = settings?.charityDescription || "";
  const website = settings?.charityWebsite || "";
  const websiteSummary = settings?.charityWebsiteSummary || "";
  const officeAddress = settings?.headOfficeAddress || "";

  // Get collection stats per type for the letters
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

  // Aggregate stats by type
  const typeStats: Record<string, { count: number; totalRaised: number; collections: number }> = {};
  for (const loc of allLocations) {
    if (!typeStats[loc.type]) typeStats[loc.type] = { count: 0, totalRaised: 0, collections: 0 };
    typeStats[loc.type].count++;
    for (const tin of loc.tins) {
      for (const mov of tin.movements) {
        if (mov.amount) {
          typeStats[loc.type].totalRaised += Number(mov.amount);
          typeStats[loc.type].collections++;
        }
      }
    }
  }

  // Parse charity themes from website summary
  const themes: string[] = [];
  if (websiteSummary) {
    const themeMatch = websiteSummary.match(/dedicated to (.+?)\.$/m);
    if (themeMatch) {
      themes.push(...themeMatch[1].split(", ").slice(0, 3));
    }
  }

  // Generate a letter for each prospect
  const letters: LetterData[] = prospects.map((prospect: {
    name: string;
    address: string;
    category: string;
  }) => {
    const catLabel = CATEGORY_LABELS[prospect.category] || "business";
    const customerWord = CATEGORY_CUSTOMER_WORDS[prospect.category] || "customers and visitors";
    const stats = typeStats[prospect.category];
    const avgPerTin = stats && stats.collections > 0
      ? (stats.totalRaised / stats.collections).toFixed(2)
      : null;
    const partnerCount = stats?.count || 0;

    // Build the letter body
    const paragraphs: string[] = [];

    // Opening
    paragraphs.push(`Dear ${prospect.name},`);

    // Introduction
    paragraphs.push(
      `I am writing to you on behalf of ${orgName} to introduce an opportunity for your ${catLabel} to make a real difference in our local community, with no cost or effort on your part.`
    );

    // About the charity — use website insights if available
    if (description) {
      paragraphs.push(description);
    } else if (themes.length > 0) {
      paragraphs.push(
        `${orgName} is a local charity dedicated to ${themes.join(", ")}. Every penny raised goes directly towards supporting people in our community who need it most.`
      );
    } else {
      paragraphs.push(
        `${orgName} is a local charity working to make a positive difference in our community. We rely on the generosity of local businesses and individuals to fund our vital work.`
      );
    }

    // The ask
    paragraphs.push(
      `We would love to place one of our collection tins at your ${catLabel}. It's completely free — we supply the tin, place it in a suitable spot, and collect it regularly. Your ${customerWord} simply drop in any loose change they'd like to donate.`
    );

    // Social proof with real data
    if (partnerCount > 0 && avgPerTin) {
      paragraphs.push(
        `We already partner with ${partnerCount} ${catLabel}${partnerCount > 1 ? "s" : ""} in the local area, and on average each tin collects £${avgPerTin} per collection. It's a small gesture that adds up to something truly meaningful.`
      );
    } else if (partnerCount > 0) {
      paragraphs.push(
        `We already have ${partnerCount} local ${catLabel}${partnerCount > 1 ? "s" : ""} proudly hosting our tins. Joining them is a wonderful way to show your support for the community.`
      );
    }

    // Benefits
    paragraphs.push(
      `Hosting a collection tin is a fantastic way to show your ${customerWord} that you care about the local area. Many businesses tell us their customers appreciate the opportunity to give back, and it creates a real sense of community pride.`
    );

    // Website reference
    if (website) {
      paragraphs.push(
        `You can find out more about our work and the impact of your support at ${website}.`
      );
    }

    // Close
    paragraphs.push(
      `If you'd be interested in hosting a tin, or would like to find out more, please don't hesitate to get in touch. We'd be happy to pop in and have a quick chat at a time that suits you.`
    );

    paragraphs.push(`Thank you for considering this request. Together, we can make a real difference.`);

    paragraphs.push(`Yours sincerely,`);
    paragraphs.push(orgName);
    if (officeAddress) paragraphs.push(officeAddress);
    if (website) paragraphs.push(website);

    return {
      prospectName: prospect.name,
      prospectAddress: prospect.address,
      category: prospect.category,
      letterBody: paragraphs.join("\n\n"),
    };
  });

  return NextResponse.json({ letters, orgName });
}
