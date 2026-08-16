import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { Plus, FileText, FlaskConical } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";

export default async function GiftAidClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const statusFilter = params.status || "";

  const claims = await prisma.giftAidClaim.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    include: {
      items: true,
      createdBy: { select: { name: true } },
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    NOTIFICATIONS_SENT: "bg-purple-100 text-purple-800",
    READY: "bg-blue-100 text-blue-800",
    SUBMITTED: "bg-yellow-100 text-yellow-800",
    ACCEPTED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    PARTIAL: "bg-orange-100 text-orange-800",
  };

  // Summary stats
  const totalClaims = claims.length;
  const totalClaimed = claims
    .filter((c) => c.status === "ACCEPTED")
    .reduce((sum, c) => sum + Number(c.amountReceived || c.totalClaimable), 0);
  const pendingAmount = claims
    .filter((c) => ["DRAFT", "NOTIFICATIONS_SENT", "READY", "SUBMITTED"].includes(c.status))
    .reduce((sum, c) => sum + Number(c.totalClaimable), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/finance" className="hover:text-gray-700">Finance</Link>
            <span>/</span>
            <Link href="/finance/gift-aid" className="hover:text-gray-700">Gift Aid</Link>
            <span>/</span>
            <span>Claims</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Gift Aid Claims</h1>
          <p className="text-gray-500 mt-1">
            Create and manage Gift Aid claims to submit to HMRC
          </p>
        </div>
        <Link href="/finance/gift-aid/claims/new">
          <Button className="bg-indigo-600 hover:bg-indigo-700 gap-1">
            <Plus className="h-4 w-4" /> New Claim
          </Button>
        </Link>
      </div>

      {/* Summary */}
      {claims.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Total Claims</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalClaims}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Total Claimed (Accepted)</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalClaimed)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Pending / In Progress</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrency(pendingAmount)}</p>
          </Card>
        </div>
      )}

      {/* Status Filter */}
      {claims.length > 0 && (
        <Card className="p-4">
          <form className="flex gap-2 flex-wrap">
            <Button
              type="submit"
              name="status"
              value=""
              variant={!statusFilter ? "default" : "outline"}
              size="sm"
            >
              All
            </Button>
            {(["DRAFT", "NOTIFICATIONS_SENT", "READY", "SUBMITTED", "ACCEPTED", "REJECTED"] as const).map(
              (status) => (
                <Button
                  key={status}
                  type="submit"
                  name="status"
                  value={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                >
                  {status}
                </Button>
              )
            )}
          </form>
        </Card>
      )}

      {/* Claims Table */}
      {claims.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Gift Aid claims"
          description="Get started by creating your first Gift Aid claim to submit to HMRC."
          actionLabel="New Claim"
          actionHref="/finance/gift-aid/claims/new"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Reference
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Period
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Donations
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Claimable
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Submitted By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {claims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <Link
                        href={`/finance/gift-aid/claims/${claim.id}`}
                        className="font-mono font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {claim.claimReference}
                      </Link>
                      {claim.isTestMode && (
                        <FlaskConical className="h-3 w-3 text-amber-500 inline ml-2" />
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {(claim.claimType || claim.notes) === "RETAIL" ? (
                        <Badge className="bg-purple-100 text-purple-800 text-xs">Retail</Badge>
                      ) : (claim.claimType || claim.notes) === "STANDARD" ? (
                        <Badge className="bg-indigo-100 text-indigo-800 text-xs">Standard</Badge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {formatDate(claim.periodStart)} – {formatDate(claim.periodEnd)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge className={statusColors[claim.status]}>
                        {claim.status === "NOTIFICATIONS_SENT" ? "Notified" : claim.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900 text-right">
                      {claim.donationCount}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(Number(claim.totalClaimable))}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {claim.submittedBy?.name || claim.createdBy.name}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {claim.submittedAt ? formatDate(claim.submittedAt) : formatDate(claim.createdAt)}
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
