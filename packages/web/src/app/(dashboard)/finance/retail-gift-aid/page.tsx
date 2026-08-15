import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Upload, FileText, Package, Calendar, Phone, Mail } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function RetailGiftAidPage() {
  await requireAuth();

  // Get recent retail imports
  const recentImports = await prisma.donation.groupBy({
    by: ["createdAt"],
    where: { isRetail: true },
    _count: { id: true },
    _sum: { amount: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Get total retail donations stats
  const stats = await prisma.donation.aggregate({
    where: { isRetail: true },
    _count: { id: true },
    _sum: { amount: true },
  });

  // Get contact capture stats (for all contacts, not just retail)
  const totalContacts = await prisma.contact.count({
    where: { status: "ACTIVE" },
  });
  const contactsWithPhone = await prisma.contact.count({
    where: { status: "ACTIVE", phone: { not: null }, NOT: { phone: "" } },
  });
  const contactsWithEmail = await prisma.contact.count({
    where: { status: "ACTIVE", email: { not: null }, NOT: { email: "" } },
  });
  const phonePct = totalContacts > 0 ? Math.round((contactsWithPhone / totalContacts) * 100) : 0;
  const emailPct = totalContacts > 0 ? Math.round((contactsWithEmail / totalContacts) * 100) : 0;

  // Get retail claims
  const retailClaims = await prisma.giftAidClaim.findMany({
    where: {
      OR: [
        { claimType: "RETAIL" },
        { notes: "RETAIL" },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      claimReference: true,
      status: true,
      totalDonations: true,
      totalClaimable: true,
      donationCount: true,
      periodStart: true,
      periodEnd: true,
    },
  });

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    NOTIFICATIONS_SENT: "bg-purple-100 text-purple-700",
    READY: "bg-blue-100 text-blue-700",
    SUBMITTED: "bg-amber-100 text-amber-700",
    ACCEPTED: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-purple-600" />
            Retail Gift Aid
          </h1>
          <p className="text-gray-600 mt-1">
            Import shop sales data and manage retail Gift Aid claims
          </p>
        </div>
        <Link href="/finance/retail-gift-aid/import">
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-500 uppercase tracking-wide">Total Retail Donations</p>
            <p className="text-3xl font-bold mt-1">{stats._count.id}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-500 uppercase tracking-wide">Total Proceeds</p>
            <p className="text-3xl font-bold text-purple-600 mt-1">
              {formatCurrency(Number(stats._sum.amount || 0))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-500 uppercase tracking-wide">Potential Gift Aid (25%)</p>
            <p className="text-3xl font-bold text-green-600 mt-1">
              {formatCurrency(Number(stats._sum.amount || 0) * 0.25)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Data Capture */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/crm/contacts?missing=phone">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Phone className="h-4 w-4" />
                    Mobile Phone Capture
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    <span className={phonePct === 100 ? "text-green-600" : phonePct >= 75 ? "text-amber-600" : "text-red-600"}>
                      {phonePct}%
                    </span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {contactsWithPhone} of {totalContacts} contacts
                  </p>
                </div>
                <div className="relative h-16 w-16">
                  <svg viewBox="0 0 36 36" className="h-16 w-16 transform -rotate-90">
                    <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.9155" fill="none"
                      stroke={phonePct === 100 ? "#16a34a" : phonePct >= 75 ? "#d97706" : "#dc2626"}
                      strokeWidth="3"
                      strokeDasharray={`${phonePct} ${100 - phonePct}`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
              {totalContacts - contactsWithPhone > 0 && (
                <p className="text-xs text-purple-600 mt-2 font-medium">
                  Click to see {totalContacts - contactsWithPhone} contact{totalContacts - contactsWithPhone !== 1 ? "s" : ""} missing a phone number →
                </p>
              )}
            </CardContent>
          </Card>
        </Link>
        <Link href="/crm/contacts?missing=email">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Mail className="h-4 w-4" />
                    Email Capture
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    <span className={emailPct === 100 ? "text-green-600" : emailPct >= 75 ? "text-amber-600" : "text-red-600"}>
                      {emailPct}%
                    </span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {contactsWithEmail} of {totalContacts} contacts
                  </p>
                </div>
                <div className="relative h-16 w-16">
                  <svg viewBox="0 0 36 36" className="h-16 w-16 transform -rotate-90">
                    <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.9155" fill="none"
                      stroke={emailPct === 100 ? "#16a34a" : emailPct >= 75 ? "#d97706" : "#dc2626"}
                      strokeWidth="3"
                      strokeDasharray={`${emailPct} ${100 - emailPct}`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
              {totalContacts - contactsWithEmail > 0 && (
                <p className="text-xs text-purple-600 mt-2 font-medium">
                  Click to see {totalContacts - contactsWithEmail} contact{totalContacts - contactsWithEmail !== 1 ? "s" : ""} missing an email →
                </p>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Claims */}
      {retailClaims.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-500" />
              Retail Claims
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500 uppercase text-xs">
                    <th className="pb-3 pr-4">Reference</th>
                    <th className="pb-3 pr-4">Period</th>
                    <th className="pb-3 pr-4">Donations</th>
                    <th className="pb-3 pr-4">Claimable</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {retailClaims.map((claim) => (
                    <tr key={claim.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/finance/gift-aid/claims/${claim.id}`}
                          className="font-medium text-purple-600 hover:text-purple-800"
                        >
                          {claim.claimReference}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {formatDate(claim.periodStart)} — {formatDate(claim.periodEnd)}
                      </td>
                      <td className="py-3 pr-4">{claim.donationCount}</td>
                      <td className="py-3 pr-4 font-medium text-green-600">
                        {formatCurrency(Number(claim.totalClaimable))}
                      </td>
                      <td className="py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[claim.status] || "bg-gray-100 text-gray-700"}`}>
                          {claim.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            How Retail Gift Aid Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="font-semibold text-purple-900 mb-1">1. Import Sales Data</p>
              <p className="text-purple-700">Upload a CSV from your EPOS system with donor names, sale amounts, and dates.</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="font-semibold text-purple-900 mb-1">2. Create Claim</p>
              <p className="text-purple-700">Go to Gift Aid Claims and create a new Retail claim. Only imported retail donations will be included.</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="font-semibold text-purple-900 mb-1">3. Notify Donors</p>
              <p className="text-purple-700">Send annual notifications giving donors 28 days to opt out or update their details.</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="font-semibold text-purple-900 mb-1">4. Submit to HMRC</p>
              <p className="text-purple-700">After 28 days, mark the claim as ready and submit to HMRC by 31 May.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
