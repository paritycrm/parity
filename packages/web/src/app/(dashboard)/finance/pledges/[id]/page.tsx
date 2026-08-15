import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Trash2, Edit2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { PledgeDetailClient } from "@/components/finance/pledge-detail-client";
import { ConfirmButton } from "@/components/ui/confirm-button";

export default async function PledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const pledge = await prisma.pledge.findUnique({
    where: { id },
    include: {
      contact: true,
      campaign: true,
      createdBy: { select: { id: true, name: true } },
      payments: {
        include: {
          donation: true,
        },
        orderBy: { date: "desc" },
      },
    },
  });

  if (!pledge) {
    notFound();
  }

  // Fetch audit logs for this pledge
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Pledge", entityId: id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  async function updatePledge(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const existing = await prisma.pledge.findUnique({ where: { id } });
    if (!existing) return;

    const newAmount = parseFloat(formData.get("amount") as string);
    const newStatus = formData.get("status") as string;
    const newFrequency = formData.get("frequency") as string;
    const newStartDate = formData.get("startDate") as string;
    const newEndDate = (formData.get("endDate") as string) || null;
    const newTotalFulfilled = parseFloat(formData.get("totalFulfilled") as string) || 0;

    // Build changes object tracking old vs new values
    const changes: Record<string, { old: any; new: any }> = {};

    if (Number(existing.amount) !== newAmount) {
      changes.amount = { old: Number(existing.amount), new: newAmount };
    }
    if (existing.status !== newStatus) {
      changes.status = { old: existing.status, new: newStatus };
    }
    if (existing.frequency !== newFrequency) {
      changes.frequency = { old: existing.frequency, new: newFrequency };
    }

    const existingStartStr = existing.startDate.toISOString().split("T")[0];
    if (newStartDate && existingStartStr !== newStartDate) {
      changes.startDate = { old: existingStartStr, new: newStartDate };
    }

    const existingEndStr = existing.endDate
      ? existing.endDate.toISOString().split("T")[0]
      : null;
    if (newEndDate !== existingEndStr) {
      changes.endDate = { old: existingEndStr, new: newEndDate };
    }

    if (Number(existing.totalFulfilled) !== newTotalFulfilled) {
      changes.totalFulfilled = {
        old: Number(existing.totalFulfilled),
        new: newTotalFulfilled,
      };
    }

    const updateData: any = {
      amount: newAmount,
      status: newStatus,
      frequency: newFrequency,
      startDate: new Date(newStartDate),
      totalFulfilled: newTotalFulfilled,
    };

    if (newEndDate) {
      updateData.endDate = new Date(newEndDate);
    } else {
      updateData.endDate = null;
    }

    await prisma.pledge.update({
      where: { id },
      data: updateData,
    });

    // Create audit log with changes
    if (Object.keys(changes).length > 0) {
      await prisma.auditLog.create({
        data: {
          entityType: "Pledge",
          entityId: id,
          action: "UPDATE",
          details: JSON.stringify(changes),
          userId: session.id,
        },
      });
    }

    revalidatePath(`/finance/pledges/${id}`);
  }

  async function deletePledge() {
    "use server";
    const session = await requireAuth();

    const existing = await prisma.pledge.findUnique({ where: { id } });

    await prisma.pledge.delete({
      where: { id },
    });

    // Create audit log for deletion
    await prisma.auditLog.create({
      data: {
        entityType: "Pledge",
        entityId: id,
        action: "DELETE",
        details: existing
          ? JSON.stringify({
              amount: { old: Number(existing.amount), new: null },
              status: { old: existing.status, new: null },
              frequency: { old: existing.frequency, new: null },
              totalFulfilled: { old: Number(existing.totalFulfilled), new: null },
            })
          : null,
        userId: session.id,
      },
    });

    revalidatePath("/finance/pledges");
    redirect("/finance/pledges");
  }

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-blue-100 text-blue-800",
    FULFILLED: "bg-green-100 text-green-800",
    PARTIALLY_FULFILLED: "bg-yellow-100 text-yellow-800",
    CANCELLED: "bg-gray-100 text-gray-800",
    OVERDUE: "bg-red-100 text-red-800",
  };

  const frequencyLabels: Record<string, string> = {
    ONE_TIME: "One-time",
    MONTHLY: "Monthly",
    QUARTERLY: "Quarterly",
    ANNUALLY: "Annually",
  };

  const actionColors: Record<string, string> = {
    CREATE: "bg-green-100 text-green-800",
    UPDATE: "bg-blue-100 text-blue-800",
    DELETE: "bg-red-100 text-red-800",
  };

  function formatChanges(changes: any): string {
    if (!changes || typeof changes !== "object") return "";
    return Object.entries(changes)
      .map(([field, vals]: [string, any]) => {
        const oldVal = vals.old ?? "—";
        const newVal = vals.new ?? "—";
        return `${field}: ${oldVal} → ${newVal}`;
      })
      .join(", ");
  }

  const outstandingAmount = Number(pledge.amount) - Number(pledge.totalFulfilled);
  const fulfillmentPercentage = Math.round(
    (Number(pledge.totalFulfilled) / Number(pledge.amount)) * 100
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/pledges">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {pledge.contact.firstName} {pledge.contact.lastName}&apos;s Pledge
          </h1>
          <p className="text-gray-500 mt-1">
            Created on {formatDate(pledge.createdAt)} by {pledge.createdBy.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="md:col-span-2 space-y-6">
          {/* Overview Card */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Pledge Overview
                  </h2>
                </div>
                <Badge className={statusColors[pledge.status] || ""}>
                  {pledge.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="text-2xl font-bold text-gray-900">
                    £{pledge.amount.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Frequency</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {frequencyLabels[pledge.frequency] || pledge.frequency}
                  </p>
                </div>
              </div>

              {pledge.campaign && (
                <div>
                  <p className="text-sm text-gray-600">Campaign</p>
                  <Link href={`/campaigns/${pledge.campaign.id}`}>
                    <p className="text-lg font-semibold text-indigo-600 hover:text-indigo-700">
                      {pledge.campaign.name}
                    </p>
                  </Link>
                </div>
              )}

              {pledge.notes && (
                <div>
                  <p className="text-sm text-gray-600">Notes</p>
                  <p className="text-gray-800 mt-1">{pledge.notes}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Fulfillment Progress */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Fulfillment Progress
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Progress</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {fulfillmentPercentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-500 h-3 rounded-full transition-all"
                    style={{ width: `${Math.min(fulfillmentPercentage, 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Amount Pledged</p>
                  <p className="text-xl font-bold text-gray-900">
                    £{pledge.totalPledged.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount Fulfilled</p>
                  <p className="text-xl font-bold text-green-600">
                    £{pledge.totalFulfilled.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Outstanding</p>
                  <p
                    className={`text-xl font-bold ${
                      outstandingAmount > 0
                        ? "text-orange-600"
                        : "text-gray-500"
                    }`}
                  >
                    £{outstandingAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Payment History */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Payment History
              </h3>
              <PledgeDetailClient pledgeId={id} />
            </div>

            {pledge.payments.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No payments recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-gray-600 font-medium">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-gray-600 font-medium">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-gray-600 font-medium">
                        Donation
                      </th>
                      <th className="px-4 py-3 text-left text-gray-600 font-medium">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pledge.payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">
                          {formatDate(payment.date)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          £{payment.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {payment.donation ? (
                            <Link
                              href={`/finance/donations/${payment.donation.id}`}
                              className="text-indigo-600 hover:text-indigo-700"
                            >
                              {payment.donation.reference || payment.donation.id}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {payment.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Edit Pledge Form */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Edit Pledge</h3>
            </CardHeader>
            <CardContent>
              <form action={updatePledge} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={Number(pledge.amount)}
                  />
                  <Select
                    label="Status"
                    name="status"
                    required
                    defaultValue={pledge.status}
                    options={[
                      { value: "ACTIVE", label: "Active" },
                      { value: "FULFILLED", label: "Fulfilled" },
                      { value: "PARTIALLY_FULFILLED", label: "Partially Fulfilled" },
                      { value: "CANCELLED", label: "Cancelled" },
                      { value: "OVERDUE", label: "Overdue" },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Frequency"
                    name="frequency"
                    required
                    defaultValue={pledge.frequency}
                    options={[
                      { value: "ONE_TIME", label: "One-time" },
                      { value: "MONTHLY", label: "Monthly" },
                      { value: "QUARTERLY", label: "Quarterly" },
                      { value: "ANNUALLY", label: "Annually" },
                    ]}
                  />
                  <Input
                    label="Total Fulfilled"
                    name="totalFulfilled"
                    type="number"
                    step="0.01"
                    defaultValue={Number(pledge.totalFulfilled)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Start Date"
                    name="startDate"
                    type="date"
                    required
                    defaultValue={pledge.startDate.toISOString().split("T")[0]}
                  />
                  <Input
                    label="End Date"
                    name="endDate"
                    type="date"
                    defaultValue={pledge.endDate?.toISOString().split("T")[0] || ""}
                  />
                </div>

                <Button type="submit">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Activity Log</h3>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No activity recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Changes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {log.user.name}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={actionColors[log.action] || "bg-gray-100 text-gray-800"}>
                              {log.action}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {formatChanges(JSON.parse(log.details || '{}'))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Details */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Contact Details
            </h3>

            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <Link
                  href={`/crm/contacts/${pledge.contact.id}`}
                  className="text-indigo-600 hover:text-indigo-700 font-semibold"
                >
                  {pledge.contact.firstName} {pledge.contact.lastName}
                </Link>
              </div>

              {pledge.contact.email && (
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <a
                    href={`mailto:${pledge.contact.email}`}
                    className="text-indigo-600 hover:text-indigo-700 font-semibold"
                  >
                    {pledge.contact.email}
                  </a>
                </div>
              )}

              {pledge.contact.phone && (
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <a
                    href={`tel:${pledge.contact.phone}`}
                    className="text-indigo-600 hover:text-indigo-700 font-semibold"
                  >
                    {pledge.contact.phone}
                  </a>
                </div>
              )}
            </div>
          </Card>

          {/* Key Dates */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Key Dates
            </h3>

            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Start Date</p>
                <p className="text-gray-900 font-semibold">
                  {formatDate(pledge.startDate)}
                </p>
              </div>

              {pledge.endDate && (
                <div>
                  <p className="text-sm text-gray-600">End Date</p>
                  <p className="text-gray-900 font-semibold">
                    {formatDate(pledge.endDate)}
                  </p>
                </div>
              )}

              {pledge.nextReminderDate && (
                <div>
                  <p className="text-sm text-gray-600">Next Reminder</p>
                  <p className="text-gray-900 font-semibold">
                    {formatDate(pledge.nextReminderDate)}
                  </p>
                </div>
              )}

              {pledge.reminderFrequency && (
                <div>
                  <p className="text-sm text-gray-600">Reminder Frequency</p>
                  <p className="text-gray-900 font-semibold">
                    {pledge.reminderFrequency}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Delete Action */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Danger Zone
            </h3>
            <form action={deletePledge}>
              <ConfirmButton
                message="Are you sure you want to delete this pledge? This action cannot be undone."
                variant="destructive"
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Pledge
              </ConfirmButton>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
