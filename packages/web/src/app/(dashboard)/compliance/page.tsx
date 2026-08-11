import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { Card } from "@/components/ui/card";
import {
  AlertCircle,
  Shield,
  AlertTriangle,
  FileText,
  Database,
  Zap,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function ComplianceDashboardPage() {
  await requireAuth();

  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all compliance data in parallel
  const [
    dpiaDraftCount,
    dpiaInReviewCount,
    dpiaApprovedCount,
    overdueDpias,
    openBreaches,
    highCriticalBreaches,
    activeSars,
    pastDueSars,
    processingActivities,
    activitiesWithoutDpa,
    highCriticalRisks,
    recentConsents,
    openClinicalHazards,
  ] = await Promise.all([
    // DPIA counts by status
    prisma.dpia.count({ where: { status: "DRAFT" } }),
    prisma.dpia.count({ where: { status: "IN_REVIEW" } }),
    prisma.dpia.count({ where: { status: "APPROVED" } }),

    // Overdue DPIAs (reviewDate in past)
    prisma.dpia.count({
      where: {
        reviewDate: { lt: now },
        status: { not: "APPROVED" },
      },
    }),

    // Open breaches
    prisma.dataBreach.count({
      where: { status: { not: "CLOSED" } },
    }),

    // High/Critical severity breaches
    prisma.dataBreach.count({
      where: {
        status: { not: "CLOSED" },
        severity: { in: ["HIGH", "CRITICAL"] },
      },
    }),

    // Active SARs (not closed)
    prisma.subjectAccessRequest.count({
      where: { status: { not: "CLOSED" } },
    }),

    // SARs past due date
    prisma.subjectAccessRequest.count({
      where: {
        status: { not: "CLOSED" },
        dueDate: { lt: now },
      },
    }),

    // Total processing activities (Dpia count)
    prisma.dpia.count(),

    // Activities without DPA sign-off (not approved)
    prisma.dpia.count({
      where: { status: { not: "APPROVED" } },
    }),

    // High/Critical risk items
    prisma.dpiaRisk.count({
      where: { riskLevel: { in: ["HIGH", "VERY_HIGH"] } },
    }),

    // Recent consent changes (last 10)
    prisma.consentRecord.findMany({
      take: 10,
      orderBy: { recordedAt: "desc" },
      include: { recordedBy: true },
    }),

    // Open clinical hazards count
    prisma.clinicalHazard.count({
      where: { status: { not: "CLOSED" } },
    }),
  ]);

  // Fetch detailed overdue items
  const [overdueSars, openBreachesDetail] = await Promise.all([
    prisma.subjectAccessRequest.findMany({
      where: {
        status: { not: "CLOSED" },
        dueDate: { lt: now },
      },
      take: 5,
      orderBy: { dueDate: "asc" },
    }),
    prisma.dataBreach.findMany({
      where: { status: { not: "CLOSED" } },
      take: 5,
      orderBy: { discoveredAt: "desc" },
    }),
  ]);

  const statCards = [
    {
      icon: FileText,
      label: "Data Protection Impact Assessments",
      value: `${dpiaDraftCount + dpiaInReviewCount + dpiaApprovedCount}`,
      subtext: `${dpiaDraftCount} Draft, ${dpiaInReviewCount} Review, ${dpiaApprovedCount} Approved`,
      alert: overdueDpias > 0,
      alertText: overdueDpias > 0 ? `${overdueDpias} overdue for review` : null,
      alertColor: "text-red-600",
      href: "/compliance/dpias",
    },
    {
      icon: AlertTriangle,
      label: "Data Breaches",
      value: openBreaches,
      subtext: "Not yet closed",
      alert: highCriticalBreaches > 0,
      alertText:
        highCriticalBreaches > 0
          ? `${highCriticalBreaches} HIGH/CRITICAL severity`
          : null,
      alertColor: "text-red-600",
      href: "/compliance/breaches",
    },
    {
      icon: Clock,
      label: "Subject Access Requests",
      value: activeSars,
      subtext: "Active (not closed)",
      alert: pastDueSars > 0,
      alertText: pastDueSars > 0 ? `${pastDueSars} past due date` : null,
      alertColor: "text-amber-600",
      href: "/compliance/sars",
    },
    {
      icon: Database,
      label: "Processing Activities",
      value: processingActivities,
      subtext: `${activitiesWithoutDpa} without DPA approval`,
      alert: activitiesWithoutDpa > 0,
      alertText:
        activitiesWithoutDpa > 0 ? `${activitiesWithoutDpa} need approval` : null,
      alertColor: "text-amber-600",
      href: "/compliance/dpias",
    },
    {
      icon: Shield,
      label: "Information Assets",
      value: highCriticalRisks,
      subtext: "High/Critical risk items",
      alert: highCriticalRisks > 0,
      alertText:
        highCriticalRisks > 0 ? `${highCriticalRisks} high risk items` : null,
      alertColor: "text-red-600",
      href: "/compliance/dpias",
    },
    {
      icon: Zap,
      label: "Clinical Hazards",
      value: openClinicalHazards,
      subtext: openClinicalHazards === 0 ? "No open hazards" : `${openClinicalHazards} open hazard${openClinicalHazards !== 1 ? "s" : ""}`,
      alert: openClinicalHazards > 0,
      alertText: openClinicalHazards > 0 ? `${openClinicalHazards} open hazard${openClinicalHazards !== 1 ? "s" : ""}` : null,
      alertColor: "text-red-600",
      href: "/compliance/clinical-safety",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Compliance Dashboard
        </h1>
        <p className="text-gray-500 mt-1">
          Data protection and privacy compliance overview
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href}>
              <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-500">
                      {card.label}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {card.value}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {card.subtext}
                    </p>
                    {card.alert && card.alertText && (
                      <div className={`flex items-center gap-1 mt-2 ${card.alertColor}`}>
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-xs font-medium">
                          {card.alertText}
                        </span>
                      </div>
                    )}
                  </div>
                  <Icon className="h-8 w-8 text-indigo-500 opacity-20" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Overdue items section */}
      {(overdueSars.length > 0 || openBreachesDetail.length > 0) && (
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <h2 className="text-lg font-semibold text-red-900">
              Action Required
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Overdue SARs */}
            {overdueSars.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-800 mb-3">
                  Overdue Subject Access Requests ({overdueSars.length})
                </h3>
                <div className="space-y-2">
                  {overdueSars.map((sar) => (
                    <Link
                      key={sar.id}
                      href={`/compliance/sars/${sar.id}`}
                      className="flex items-center justify-between p-3 bg-white rounded border border-red-200 hover:bg-red-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {sar.requesterName}
                        </p>
                        <p className="text-xs text-red-600">
                          Due: {formatDate(sar.dueDate)}
                        </p>
                      </div>
                      <Badge className="bg-red-100 text-red-800">
                        {sar.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Open Breaches > 72 hours */}
            {openBreachesDetail.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-800 mb-3">
                  Open Data Breaches ({openBreachesDetail.length})
                </h3>
                <div className="space-y-2">
                  {openBreachesDetail.map((breach) => {
                    const hoursElapsed =
                      (now.getTime() - breach.discoveredAt.getTime()) /
                      (1000 * 60 * 60);
                    const isOver72Hours = hoursElapsed > 72;
                    return (
                      <Link
                        key={breach.id}
                        href={`/compliance/breaches/${breach.id}`}
                        className="flex items-center justify-between p-3 bg-white rounded border border-red-200 hover:bg-red-50 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {breach.title}
                          </p>
                          <p className="text-xs text-red-600">
                            {isOver72Hours && "Discovered "}
                            {formatDate(breach.discoveredAt)}
                            {isOver72Hours && " (>72 hrs)"}
                          </p>
                        </div>
                        <Badge
                          className={
                            breach.severity === "CRITICAL"
                              ? "bg-red-100 text-red-800"
                              : breach.severity === "HIGH"
                                ? "bg-orange-100 text-orange-800"
                                : "bg-yellow-100 text-yellow-800"
                          }
                        >
                          {breach.severity}
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recent Activity */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Consent Changes
        </h2>
        {recentConsents.length === 0 ? (
          <p className="text-sm text-gray-500">No recent consent changes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">
                    Action
                  </th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">
                    Recorded By
                  </th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentConsents.map((record) => (
                  <tr key={record.id}>
                    <td className="py-2 text-gray-900 font-medium">
                      {record.consentType}
                    </td>
                    <td className="py-2">
                      <Badge
                        className={
                          record.action === "GRANTED"
                            ? "bg-green-100 text-green-800"
                            : record.action === "WITHDRAWN"
                              ? "bg-red-100 text-red-800"
                              : "bg-blue-100 text-blue-800"
                        }
                      >
                        {record.action}
                      </Badge>
                    </td>
                    <td className="py-2 text-gray-600">
                      {record.recordedBy.name}
                    </td>
                    <td className="py-2 text-gray-500">
                      {formatDate(record.recordedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
