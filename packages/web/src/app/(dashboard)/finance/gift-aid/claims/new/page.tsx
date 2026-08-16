import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Info, ShoppingBag, Heart } from "lucide-react";
import { getNextClaimReference, calculateGiftAid, isValidUKPostcode } from "@/lib/hmrc";
import { createClaim } from "../actions";
import { ClaimableTable } from "./claimable-table";

// Donation types NOT eligible for Gift Aid
const NON_ELIGIBLE_TYPES = ["IN_KIND", "GRANT", "LEGACY"];

export default async function NewGiftAidClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const claimType = params.type as "STANDARD" | "RETAIL" | undefined;

  // If no type selected, show the type picker
  if (!claimType) {
    // Get counts for each type
    const [standardDecls, retailDecls] = await Promise.all([
      prisma.giftAid.count({ where: { status: "ACTIVE", type: "STANDARD" } }),
      prisma.giftAid.count({ where: { status: "ACTIVE", type: "RETAIL" } }),
    ]);

    // Count unclaimed eligible donations per type
    const standardContacts = await prisma.giftAid.findMany({
      where: { status: "ACTIVE", type: "STANDARD" },
      select: { contactId: true },
    });
    const retailContacts = await prisma.giftAid.findMany({
      where: { status: "ACTIVE", type: "RETAIL" },
      select: { contactId: true },
    });

    const standardContactIds = [...new Set(standardContacts.map((g) => g.contactId))];
    const retailContactIds = [...new Set(retailContacts.map((g) => g.contactId))];

    const [standardDonations, retailDonations] = await Promise.all([
      standardContactIds.length > 0
        ? prisma.donation.aggregate({
            _sum: { amount: true },
            _count: true,
            where: {
              contactId: { in: standardContactIds },
              giftAidClaimed: false,
              status: "RECEIVED",
              type: { notIn: NON_ELIGIBLE_TYPES },
            },
          })
        : { _sum: { amount: 0 }, _count: 0 },
      retailContactIds.length > 0
        ? prisma.donation.aggregate({
            _sum: { amount: true },
            _count: true,
            where: {
              contactId: { in: retailContactIds },
              giftAidClaimed: false,
              status: "RECEIVED",
              type: { notIn: NON_ELIGIBLE_TYPES },
            },
          })
        : { _sum: { amount: 0 }, _count: 0 },
    ]);

    const standardAmount = (standardDonations._sum?.amount || 0) as number;
    const retailAmount = (retailDonations._sum?.amount || 0) as number;
    const standardCount = (standardDonations._count || 0) as number;
    const retailCount = (retailDonations._count || 0) as number;

    function fmt(n: number) {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
    }

    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/finance" className="hover:text-gray-700">Finance</Link>
            <span>/</span>
            <Link href="/finance/gift-aid" className="hover:text-gray-700">Gift Aid</Link>
            <span>/</span>
            <Link href="/finance/gift-aid/claims" className="hover:text-gray-700">Claims</Link>
            <span>/</span>
            <span>New Claim</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/finance/gift-aid/claims" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">New Gift Aid Claim</h1>
              <p className="text-gray-500 mt-1">
                Choose the type of Gift Aid claim to create
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {/* Standard Gift Aid */}
          <Link href="/finance/gift-aid/claims/new?type=STANDARD">
            <Card className="hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer h-full">
              <CardContent className="pt-6 pb-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-indigo-50 rounded-lg">
                    <Heart className="h-8 w-8 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">Standard Gift Aid</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Regular donations from individuals with standard Gift Aid declarations
                    </p>
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{standardDecls} active declarations</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">{standardCount} unclaimed donations</span>
                        <span className="font-semibold text-indigo-600">
                          {fmt(standardAmount)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Gift Aid: {fmt(standardAmount * 0.25)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Retail Gift Aid */}
          <Link href="/finance/gift-aid/claims/new?type=RETAIL">
            <Card className="hover:border-purple-300 hover:shadow-md transition-all cursor-pointer h-full">
              <CardContent className="pt-6 pb-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <ShoppingBag className="h-8 w-8 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">Retail Gift Aid</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Donations from charity shop sales and retail Gift Aid scheme
                    </p>
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{retailDecls} active declarations</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">{retailCount} unclaimed donations</span>
                        <span className="font-semibold text-purple-600">
                          {fmt(retailAmount)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Gift Aid: {fmt(retailAmount * 0.25)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  // ── Type selected — show the claimable donations table ──

  const now = new Date();
  const currentYear = now.getFullYear();

  // Get the last submitted/accepted claim of this type
  const lastClaim = await prisma.giftAidClaim.findFirst({
    where: {
      status: { in: ["SUBMITTED", "ACCEPTED", "PARTIAL"] },
      notes: { contains: claimType }, // We store claim type in notes
    },
    orderBy: { periodEnd: "desc" },
  });

  const defaultStart = lastClaim
    ? new Date(new Date(lastClaim.periodEnd).getTime() + 86400000)
    : new Date(currentYear, 0, 1);
  const defaultEnd = now;

  const periodStart = defaultStart.toISOString().split("T")[0];
  const periodEnd = defaultEnd.toISOString().split("T")[0];

  // Get claim reference
  const claimsInYear = await prisma.giftAidClaim.count({
    where: {
      createdAt: {
        gte: new Date(currentYear, 0, 1),
        lt: new Date(currentYear + 1, 0, 1),
      },
    },
  });
  const nextReference = getNextClaimReference(currentYear, claimsInYear);

  // Find contacts with active declarations of this type
  const activeDeclarations = await prisma.giftAid.findMany({
    where: {
      status: "ACTIVE",
      type: claimType,
      startDate: { lte: defaultEnd },
      OR: [{ endDate: null }, { endDate: { gte: defaultStart } }],
    },
    select: { contactId: true },
  });

  const eligibleContactIds = [...new Set(activeDeclarations.map((d) => d.contactId))];

  // Find all unclaimed donations from these contacts
  const eligibleDonations =
    eligibleContactIds.length > 0
      ? await prisma.donation.findMany({
          where: {
            contactId: { in: eligibleContactIds },
            giftAidClaimed: false,
            status: "RECEIVED",
            type: { notIn: NON_ELIGIBLE_TYPES },
            date: { gte: defaultStart, lte: defaultEnd },
          },
          include: {
            contact: {
              select: {
                firstName: true,
                lastName: true,
                postcode: true,
                addressLine1: true,
                city: true,
              },
            },
          },
          orderBy: { date: "desc" },
        })
      : [];

  const donations = eligibleDonations.map((d) => ({
    id: d.id,
    contactId: d.contactId,
    contactName: `${d.contact.firstName || ""} ${d.contact.lastName || ""}`.trim(),
    postcode: d.contact.postcode,
    amount: Number(d.amount),
    date: d.date.toISOString(),
    type: d.type,
    method: d.method,
    reference: d.reference,
    giftAidAmount: calculateGiftAid(Number(d.amount)),
    hasValidPostcode: d.contact.postcode ? isValidUKPostcode(d.contact.postcode) : false,
  }));

  const typeLabel = claimType === "RETAIL" ? "Retail" : "Standard";
  const typeColor = claimType === "RETAIL" ? "purple" : "indigo";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/finance" className="hover:text-gray-700">Finance</Link>
          <span>/</span>
          <Link href="/finance/gift-aid" className="hover:text-gray-700">Gift Aid</Link>
          <span>/</span>
          <Link href="/finance/gift-aid/claims" className="hover:text-gray-700">Claims</Link>
          <span>/</span>
          <Link href="/finance/gift-aid/claims/new" className="hover:text-gray-700">New Claim</Link>
          <span>/</span>
          <span>{typeLabel}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/finance/gift-aid/claims/new" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {typeLabel} Gift Aid Claim — {nextReference}
              </h1>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  claimType === "RETAIL"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-indigo-100 text-indigo-700"
                }`}
              >
                {typeLabel}
              </span>
            </div>
            <p className="text-gray-500 mt-1">
              {eligibleContactIds.length} contacts with active {typeLabel.toLowerCase()} declarations
              {" · "}
              {donations.length} eligible donation{donations.length !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>
      </div>

      {donations.length === 0 ? (
        <Card className="border-gray-200">
          <CardContent className="pt-6 pb-6">
            <div className="text-center py-8">
              <Info className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No eligible donations found
              </h3>
              <p className="text-gray-500 max-w-md mx-auto text-sm">
                There are no unclaimed donations from contacts with active {typeLabel.toLowerCase()}{" "}
                Gift Aid declarations in this period.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ClaimableTable
          donations={donations}
          claimReference={nextReference}
          periodStart={periodStart}
          periodEnd={periodEnd}
          claimType={claimType}
          createAction={createClaim}
        />
      )}
    </div>
  );
}
