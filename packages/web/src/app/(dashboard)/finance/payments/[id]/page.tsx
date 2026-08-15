import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Trash2, Edit2, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      contact: true,
      provider: true,
    },
  });

  if (!payment) notFound();

  // Fetch audit logs for this payment
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Payment", entityId: id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  async function updatePayment(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) return;

    const newAmount = parseFloat(formData.get("amount") as string);
    const newStatus = formData.get("status") as string;
    const newMethod = (formData.get("method") as string) || null;
    const newReference = (formData.get("reference") as string) || null;
    const newPaymentDate = formData.get("paymentDate") as string;

    // Build changes object tracking old vs new values
    const changes: Record<string, { old: any; new: any }> = {};

    if (Number(existing.amount) !== newAmount) {
      changes.amount = { old: Number(existing.amount), new: newAmount };
    }
    if (existing.status !== newStatus) {
      changes.status = { old: existing.status, new: newStatus };
    }
    if (existing.method !== newMethod) {
      changes.method = { old: existing.method, new: newMethod };
    }
    if (existing.externalId !== newReference) {
      changes.reference = { old: existing.externalId, new: newReference };
    }

    const existingDateStr = existing.paidAt
      ? existing.paidAt.toISOString().split("T")[0]
      : existing.createdAt.toISOString().split("T")[0];
    if (newPaymentDate && existingDateStr !== newPaymentDate) {
      changes.paymentDate = { old: existingDateStr, new: newPaymentDate };
    }

    await prisma.payment.update({
      where: { id },
      data: {
        amount: newAmount,
        status: newStatus,
        method: newMethod,
        externalId: newReference,
        paidAt: newStatus === "SUCCEEDED" ? new Date(newPaymentDate) : existing.paidAt,
        refundedAt: newStatus === "REFUNDED" ? new Date() : existing.refundedAt,
      },
    });

    // Create audit log with changes
    if (Object.keys(changes).length > 0) {
      await prisma.auditLog.create({
        data: {
          entityType: "Payment",
          entityId: id,
          action: "UPDATE",
          changes,
          userId: session.id,
        },
      });
    }

    revalidatePath(`/finance/payments/${id}`);
  }

  async function deletePayment() {
    "use server";
    const session = await requireAuth();

    const existing = await prisma.payment.findUnique({ where: { id } });

    await prisma.payment.delete({
      where: { id },
    });

    // Create audit log for deletion
    await prisma.auditLog.create({
      data: {
        entityType: "Payment",
        entityId: id,
        action: "DELETE",
        changes: existing
          ? {
              amount: { old: existing.amount, new: null },
              status: { old: existing.status, new: null },
              method: { old: existing.method, new: null },
            }
          : null,
        userId: session.id,
      },
    });

    revalidatePath("/finance/payments");
    redirect("/finance/payments");
  }

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    SUCCEEDED: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
    REFUNDED: "bg-orange-100 text-orange-800",
    CANCELLED: "bg-gray-100 text-gray-800",
  };

  const typeColors: Record<string, string> = {
    ONE_OFF: "bg-blue-100 text-blue-800",
    SUBSCRIPTION: "bg-indigo-100 text-indigo-800",
    EVENT_FEE: "bg-yellow-100 text-yellow-800",
    MEMBERSHIP_FEE: "bg-pink-100 text-pink-800",
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/payments" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Payment Details</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  £{payment.amount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </p>
                <Link
                  href={`/crm/contacts/${payment.contactId}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-1 block"
                >
                  {payment.contact.firstName} {payment.contact.lastName}
                </Link>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </p>
                <p className="text-sm text-gray-900 mt-1">{formatDate(payment.createdAt)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</p>
                <div className="mt-1">
                  <Badge className={typeColors[payment.type] || "bg-gray-100 text-gray-800"}>
                    {payment.type.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </p>
                <div className="mt-1">
                  <Badge className={statusColors[payment.status] || "bg-gray-100 text-gray-800"}>
                    {payment.status}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Currency
                </p>
                <p className="text-sm text-gray-900 mt-1">{payment.currency}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-gray-100">
            <div className="space-y-4">
              {payment.method && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Method
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{payment.method}</p>
                </div>
              )}
              {payment.paidAt && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid At
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{formatDate(payment.paidAt)}</p>
                </div>
              )}
              {payment.externalId && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Provider Reference
                  </p>
                  <p className="text-sm text-gray-900 mt-1 font-mono">{payment.externalId}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {payment.provider && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Provider
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{payment.provider.name}</p>
                </div>
              )}
              {payment.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{payment.description}</p>
                </div>
              )}
              {payment.failureReason && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Failure Reason
                  </p>
                  <p className="text-sm text-red-600 mt-1">{payment.failureReason}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Payment Form */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Edit Payment</h3>
        </CardHeader>
        <CardContent>
          <form action={updatePayment} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Amount"
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={payment.amount}
              />
              <Select
                label="Status"
                name="status"
                required
                defaultValue={payment.status}
                options={[
                  { value: "PENDING", label: "Pending" },
                  { value: "SUCCEEDED", label: "Completed" },
                  { value: "FAILED", label: "Failed" },
                  { value: "REFUNDED", label: "Refunded" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Payment Date"
                name="paymentDate"
                type="date"
                defaultValue={
                  payment.paidAt
                    ? payment.paidAt.toISOString().split("T")[0]
                    : payment.createdAt.toISOString().split("T")[0]
                }
              />
              <Input
                label="Method"
                name="method"
                placeholder="e.g. Card, Bank Transfer"
                defaultValue={payment.method || ""}
              />
            </div>

            <Input
              label="Reference"
              name="reference"
              placeholder="e.g. transaction ID"
              defaultValue={payment.externalId || ""}
            />

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
                        {formatChanges(log.changes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/finance/payments">
          <Button variant="outline">Back</Button>
        </Link>
        <form action={deletePayment}>
          <ConfirmButton
            message="Are you sure you want to delete this payment?"
            variant="destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
