import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Edit, Trash2, Calendar, DollarSign, Target, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { OpportunityDetail } from "@/components/finance/opportunity-detail";

const STAGE_LABELS: Record<string, string> = {
  IDENTIFICATION: "Identification",
  QUALIFICATION: "Qualification",
  CULTIVATION: "Cultivation",
  SOLICITATION: "Solicitation",
  NEGOTIATION: "Negotiation",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
};

const STAGE_COLORS: Record<string, string> = {
  IDENTIFICATION: "bg-gray-100 text-gray-800",
  QUALIFICATION: "bg-blue-100 text-blue-800",
  CULTIVATION: "bg-purple-100 text-purple-800",
  SOLICITATION: "bg-amber-100 text-amber-800",
  NEGOTIATION: "bg-orange-100 text-orange-800",
  CLOSED_WON: "bg-green-100 text-green-800",
  CLOSED_LOST: "bg-red-100 text-red-800",
};

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const opportunity = await prisma.donorOpportunity.findUnique({
    where: { id },
    include: {
      contact: true,
      campaign: true,
      assignedTo: true,
      createdBy: true,
    },
  });

  if (!opportunity) {
    return (
      <div className="space-y-6">
        <Link href="/finance/pipeline">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Pipeline
          </Button>
        </Link>
        <Card className="p-6 text-center">
          <p className="text-gray-500">Opportunity not found</p>
        </Card>
      </div>
    );
  }

  const stageHistory = Array.isArray(opportunity.stageHistory)
    ? opportunity.stageHistory
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/finance/pipeline">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pipeline
            </Button>
          </Link>
        </div>
        <div className="flex gap-2">
          <Link href={`/finance/pipeline/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="p-6 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {opportunity.name}
                </h1>
                <div className="mt-2 flex items-center gap-2">
                  <Badge className={STAGE_COLORS[opportunity.stage]}>
                    {STAGE_LABELS[opportunity.stage]}
                  </Badge>
                </div>
              </div>

              {opportunity.description && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Description</h2>
                  <p className="mt-1 text-gray-600">{opportunity.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    £{opportunity.amount.toFixed(2)}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">
                    Probability
                  </label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {opportunity.probability}%
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">
                    Weighted Value
                  </label>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    £{(Number(opportunity.amount) * (opportunity.probability / 100)).toFixed(2)}
                  </p>
                </div>
              </div>

              {opportunity.notes && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
                  <p className="mt-1 text-gray-600 whitespace-pre-wrap">{opportunity.notes}</p>
                </div>
              )}

              {opportunity.lostReason && (
                <div className="bg-red-50 p-4 rounded-lg">
                  <h2 className="text-sm font-semibold text-red-800">Lost Reason</h2>
                  <p className="mt-1 text-red-700">{opportunity.lostReason}</p>
                </div>
              )}
            </div>
          </Card>

          {stageHistory.length > 0 && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Stage History
                </h2>
                <div className="space-y-3">
                  {stageHistory.map((entry: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-2 w-2 rounded-full bg-indigo-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {STAGE_LABELS[entry.stage] || entry.stage}
                          </span>
                          <span className="text-sm text-gray-500">
                            by {entry.changedBy}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(new Date(entry.timestamp))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <OpportunityDetail opportunity={opportunity} />
        </div>
      </div>
    </div>
  );
}
