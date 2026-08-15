import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, CheckCircle, XCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default async function MyGiftAidPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.contactId) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <Heart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Account Not Linked</h2>
        <p className="text-gray-500 mt-2">Your account is not linked to a donor record.</p>
      </div>
    );
  }

  const [declarations, donations] = await Promise.all([
    prisma.giftAid.findMany({
      where: { contactId: session.contactId },
      orderBy: { declarationDate: "desc" },
    }),
    prisma.donation.findMany({
      where: { contactId: session.contactId, isGiftAidable: true, status: "RECEIVED" },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  const activeDeclaration = declarations.find((d) => d.status === "ACTIVE");
  const totalGiftAidable = donations.reduce((s, d) => s + Number(d.amount), 0);
  const totalGiftAidValue = totalGiftAidable * 0.25;
  const claimed = donations.filter((d) => d.giftAidClaimed).reduce((s, d) => s + Number(d.amount) * 0.25, 0);
  const unclaimed = totalGiftAidValue - claimed;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Gift Aid</h1>
        <p className="text-gray-500 mt-1">Your Gift Aid declarations and how much extra your donations have generated</p>
      </div>

      {/* Status Card */}
      <Card>
        <CardContent className="pt-6">
          {activeDeclaration ? (
            <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg">
              <CheckCircle className="h-10 w-10 text-green-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-900 text-lg">Gift Aid Active</h3>
                <p className="text-sm text-green-700 mt-1">
                  Your declaration was signed on {formatDate(activeDeclaration.declarationDate)}
                  {activeDeclaration.endDate
                    ? ` and covers donations until ${formatDate(activeDeclaration.endDate)}`
                    : " and covers all future donations"}.
                </p>
                <p className="text-sm text-green-700 mt-2">
                  Every £1 you donate is worth £1.25 to the charity through Gift Aid.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-lg">
              <XCircle className="h-10 w-10 text-amber-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900 text-lg">No Active Gift Aid Declaration</h3>
                <p className="text-sm text-amber-700 mt-1">
                  If you are a UK taxpayer, you can boost your donations by 25% at no extra cost to you.
                  Contact the charity to set up a Gift Aid declaration.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Value Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-green-600">£{totalGiftAidValue.toFixed(2)}</p>
            <p className="text-sm text-gray-500">Total Gift Aid Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-indigo-600">£{claimed.toFixed(2)}</p>
            <p className="text-sm text-gray-500">Claimed by Charity</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-amber-600">£{unclaimed.toFixed(2)}</p>
            <p className="text-sm text-gray-500">Pending Claim</p>
          </CardContent>
        </Card>
      </div>

      {/* Declaration History */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Declaration History</h2>
        </CardHeader>
        <CardContent>
          {declarations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No declarations on file</p>
          ) : (
            <div className="space-y-3">
              {declarations.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Declaration signed {formatDate(d.declarationDate)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {d.source === "DIGITAL" ? "Signed digitally" : d.source === "PAPER" ? "Paper declaration" : "Manual entry"}
                      {d.endDate ? ` · Expires ${formatDate(d.endDate)}` : " · No expiry"}
                    </p>
                  </div>
                  <Badge className={
                    d.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                    d.status === "EXPIRED" ? "bg-gray-100 text-gray-800" :
                    "bg-red-100 text-red-800"
                  }>
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gift Aid Eligible Donations */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Recent Gift Aid Eligible Donations</h2>
        </CardHeader>
        <CardContent>
          {donations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No Gift Aid eligible donations yet</p>
          ) : (
            <div className="space-y-2">
              {donations.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-sm text-gray-900">{formatDate(d.date)}</p>
                    <p className="text-xs text-gray-500">{d.type.replace("_", " ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">£{d.amount.toFixed(2)}</p>
                    <p className="text-xs text-green-600">+£{(Number(d.amount) * 0.25).toFixed(2)} Gift Aid</p>
                    {d.giftAidClaimed ? (
                      <Badge className="bg-green-100 text-green-800 text-xs">Claimed</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 text-xs">Pending</Badge>
                    )}
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
