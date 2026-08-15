import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoundSterling, Heart, Download, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function MyDonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ taxYear?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.contactId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <PoundSterling className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Account Not Linked</h2>
        <p className="text-gray-500 mt-2">Your account is not linked to a donor record. Please contact the charity to set this up.</p>
      </div>
    );
  }

  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  // UK tax year runs 6 Apr to 5 Apr
  const selectedTaxYear = params.taxYear ? parseInt(params.taxYear) : currentYear - (new Date().getMonth() < 3 || (new Date().getMonth() === 3 && new Date().getDate() < 6) ? 1 : 0);
  const taxYearStart = new Date(selectedTaxYear, 3, 6); // 6 Apr
  const taxYearEnd = new Date(selectedTaxYear + 1, 3, 5, 23, 59, 59); // 5 Apr next year

  const [allDonations, taxYearDonations, contact] = await Promise.all([
    prisma.donation.findMany({
      where: { contactId: session.contactId, status: { in: ["RECEIVED", "PENDING"] } },
      orderBy: { date: "desc" },
      take: 50,
      include: { event: true, campaign: true },
    }),
    prisma.donation.findMany({
      where: {
        contactId: session.contactId,
        status: { in: ["RECEIVED", "PENDING"] },
        date: { gte: taxYearStart, lte: taxYearEnd },
      },
      orderBy: { date: "asc" },
      include: { event: true, campaign: true },
    }),
    prisma.contact.findUnique({
      where: { id: session.contactId },
      include: { giftAids: { where: { status: "ACTIVE" } } },
    }),
  ]);

  const totalAllTime = allDonations.reduce((s, d) => s + Number(d.amount), 0);
  const totalTaxYear = taxYearDonations.reduce((s, d) => s + Number(d.amount), 0);
  const giftAidableTaxYear = taxYearDonations.filter((d) => d.isGiftAidable).reduce((s, d) => s + Number(d.amount), 0);
  const giftAidValue = giftAidableTaxYear * 0.25;
  const hasActiveGiftAid = (contact?.giftAids?.length || 0) > 0;

  // Available tax years (last 5)
  const taxYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Donations</h1>
        <p className="text-gray-500 mt-1">View your giving history and download tax year statements</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <PoundSterling className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">£{totalAllTime.toFixed(2)}</p>
            <p className="text-sm text-gray-500">Total Given</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">£{totalTaxYear.toFixed(2)}</p>
            <p className="text-sm text-gray-500">{selectedTaxYear}/{selectedTaxYear + 1} Tax Year</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Heart className="h-8 w-8 text-amber-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">£{giftAidValue.toFixed(2)}</p>
            <p className="text-sm text-gray-500">Gift Aid Value</p>
          </CardContent>
        </Card>
      </div>

      {/* Tax Year Selector + Download */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Tax Year Statement</h2>
            <div className="flex items-center gap-3">
              <form className="flex items-center gap-2">
                <select
                  name="taxYear"
                  defaultValue={selectedTaxYear}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                  onChange={(e) => {
                    // Client-side navigation via form submit
                  }}
                >
                  {taxYears.map((y) => (
                    <option key={y} value={y}>
                      {y}/{y + 1}
                    </option>
                  ))}
                </select>
                <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                  View
                </button>
              </form>
              <Link
                href={`/api/my/donations/export?taxYear=${selectedTaxYear}`}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {taxYearDonations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No donations in this tax year</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">For</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Gift Aid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {taxYearDonations.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-3 text-gray-900">{formatDate(d.date)}</td>
                      <td className="px-4 py-3">
                        <Badge className="bg-gray-100 text-gray-700">{d.type.replace("_", " ")}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {d.event?.name || d.campaign?.name || "General"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">£{d.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        {d.isGiftAidable ? (
                          <Badge className="bg-green-100 text-green-800">Yes</Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td colSpan={3} className="px-4 py-3 font-semibold text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">£{totalTaxYear.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center font-medium text-green-600">
                      +£{giftAidValue.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gift Aid Status */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Gift Aid Status</h2>
        </CardHeader>
        <CardContent>
          {hasActiveGiftAid ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
              <Heart className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Gift Aid Declaration Active</p>
                <p className="text-sm text-green-700">Your donations are automatically boosted by 25% through Gift Aid at no extra cost to you.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg">
              <Heart className="h-8 w-8 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">No Gift Aid Declaration</p>
                <p className="text-sm text-amber-700">
                  If you are a UK taxpayer, you can boost your donations by 25% at no extra cost. Contact the charity to set up a Gift Aid declaration.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Donations */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">All Donations</h2>
        </CardHeader>
        <CardContent>
          {allDonations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No donations recorded yet</p>
          ) : (
            <div className="space-y-2">
              {allDonations.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-sm text-gray-900">{formatDate(d.date)}</p>
                    <p className="text-xs text-gray-500">
                      {d.type.replace("_", " ")}
                      {d.event ? ` · ${d.event.name}` : ""}
                      {d.campaign ? ` · ${d.campaign.name}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">£{d.amount.toFixed(2)}</p>
                    {d.isGiftAidable && <span className="text-xs text-amber-600">+Gift Aid</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
