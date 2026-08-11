import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Trash2, RotateCw, ToggleLeft, ToggleRight, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";

export default async function MembershipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();

  const membership = await prisma.membership.findUnique({
    where: { id },
    include: {
      contact: true,
      membershipType: true,
      renewals: {
        orderBy: { renewedAt: "desc" },
      },
    },
  });

  if (!membership) notFound();

  // Fetch audit logs for this membership
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Membership", entityId: id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    EXPIRED: "bg-red-100 text-red-800",
    CANCELLED: "bg-gray-100 text-gray-800",
    PENDING: "bg-yellow-100 text-yellow-800",
    LAPSED: "bg-orange-100 text-orange-800",
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

  async function renewMembership() {
    "use server";
    const session = await requireAuth();

    const now = new Date();
    const currentMembership = await prisma.membership.findUnique({
      where: { id },
      include: { membershipType: true },
    });

    if (!currentMembership) return;

    const oldEndDate = currentMembership.endDate.toISOString().split("T")[0];
    const oldStatus = currentMembership.status;

    const newEndDate = new Date(currentMembership.endDate);
    newEndDate.setMonth(newEndDate.getMonth() + currentMembership.membershipType.duration);

    await prisma.membership.update({
      where: { id },
      data: {
        endDate: newEndDate,
        status: "ACTIVE",
        renewalDate: now,
      },
    });

    await prisma.membershipRenewal.create({
      data: {
        membershipId: id,
        fromDate: currentMembership.endDate,
        toDate: newEndDate,
        amount: currentMembership.membershipType.price,
        paymentMethod: currentMembership.paymentMethod || undefined,
      },
    });

    // Create audit log for renewal
    const changes: Record<string, { old: any; new: any }> = {
      endDate: { old: oldEndDate, new: newEndDate.toISOString().split("T")[0] },
    };
    if (oldStatus !== "ACTIVE") {
      changes.status = { old: oldStatus, new: "ACTIVE" };
    }

    await prisma.auditLog.create({
      data: {
        entityType: "Membership",
        entityId: id,
        action: "UPDATE",
        changes,
        userId: session.id,
      },
    });

    revalidatePath(`/finance/memberships/${id}`);
  }

  async function cancelMembership(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const existing = await prisma.membership.findUnique({ where: { id } });
    if (!existing) return;

    const reason = formData.get("cancelReason") as string;

    await prisma.membership.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason || null,
      },
    });

    // Create audit log for cancellation
    await prisma.auditLog.create({
      data: {
        entityType: "Membership",
        entityId: id,
        action: "UPDATE",
        changes: {
          status: { old: existing.status, new: "CANCELLED" },
        },
        userId: session.id,
      },
    });

    revalidatePath(`/finance/memberships/${id}`);
  }

  async function toggleAutoRenew() {
    "use server";
    const session = await requireAuth();

    const current = await prisma.membership.findUnique({ where: { id } });
    if (!current) return;

    const newAutoRenew = !current.autoRenew;

    await prisma.membership.update({
      where: { id },
      data: {
        autoRenew: newAutoRenew,
      },
    });

    // Create audit log for auto-renew toggle
    await prisma.auditLog.create({
      data: {
        entityType: "Membership",
        entityId: id,
        action: "UPDATE",
        changes: {
          autoRenew: { old: current.autoRenew, new: newAutoRenew },
        },
        userId: session.id,
      },
    });

    revalidatePath(`/finance/memberships/${id}`);
  }

  async function deleteMembership() {
    "use server";
    const session = await requireAuth();

    const existing = await prisma.membership.findUnique({ where: { id } });

    await prisma.membership.delete({
      where: { id },
    });

    // Create audit log for deletion
    await prisma.auditLog.create({
      data: {
        entityType: "Membership",
        entityId: id,
        action: "DELETE",
        changes: existing
          ? {
              status: { old: existing.status, new: null },
              autoRenew: { old: existing.autoRenew, new: null },
              startDate: {
                old: existing.startDate.toISOString().split("T")[0],
                new: null,
              },
              endDate: {
                old: existing.endDate.toISOString().split("T")[0],
                new: null,
              },
            }
          : null,
        userId: session.id,
      },
    });

    revalidatePath("/finance/memberships");
    redirect("/finance/memberships");
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/memberships" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Membership Details</h1>
      </div>

      <Card className="rounded-lg">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member Number
                </p>
                <p className="text-lg font-mono font-bold text-gray-900 mt-1">
                  {membership.memberNumber}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </p>
                <Link
                  href={`/crm/contacts/${membership.contact.id}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-1 block"
                >
                  {membership.contact.firstName} {membership.contact.lastName}
                </Link>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </p>
                <p className="text-sm text-gray-900 mt-1">{membership.contact.email || "—"}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </p>
                <div className="mt-1">
                  <Badge className={statusColors[membership.status]}>{membership.status}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Membership Type
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {membership.membershipType.name}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </p>
                <p className="text-sm font-bold text-gray-900 mt-1">
                  £{membership.membershipType.price.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-gray-100">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Date
                </p>
                <p className="text-sm text-gray-900 mt-1">{formatDate(membership.startDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  End Date
                </p>
                <p className="text-sm text-gray-900 mt-1">{formatDate(membership.endDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </p>
                <p className="text-sm text-gray-900 mt-1">
                  {membership.membershipType.duration} months
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Auto Renewal
                </p>
                <p className="text-sm text-gray-900 mt-1">
                  {membership.autoRenew ? "Enabled" : "Disabled"}
                </p>
              </div>
              {membership.paymentMethod && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Method
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{membership.paymentMethod}</p>
                </div>
              )}
              {membership.amountPaid && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount Paid
                  </p>
                  <p className="text-sm text-gray-900 mt-1">
                    £{membership.amountPaid.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {membership.membershipType.description && (
            <div className="mt-8 pt-8 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </p>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                {membership.membershipType.description}
              </p>
            </div>
          )}

          {membership.notes && (
            <div className="mt-8 pt-8 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</p>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{membership.notes}</p>
            </div>
          )}

          {membership.status === "CANCELLED" && membership.cancelReason && (
            <div className="mt-8 pt-8 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cancellation Reason
              </p>
              <p className="text-sm text-gray-700 mt-2">{membership.cancelReason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renewal History */}
      {membership.renewals.length > 0 && (
        <Card className="rounded-lg">
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Renewal History</h3>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Renewed At
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      From Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      To Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Method
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {membership.renewals.map((renewal) => (
                    <tr key={renewal.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatDate(renewal.renewedAt)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatDate(renewal.fromDate)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatDate(renewal.toDate)}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">
                        £{renewal.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {renewal.paymentMethod || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {membership.status === "ACTIVE" && (
          <>
            <form action={renewMembership}>
              <Button type="submit">
                <RotateCw className="h-4 w-4 mr-2" />
                Renew Membership
              </Button>
            </form>
            <form action={toggleAutoRenew}>
              <Button type="submit" variant="outline">
                {membership.autoRenew ? (
                  <>
                    <ToggleRight className="h-4 w-4 mr-2" />
                    Disable Auto Renew
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-4 w-4 mr-2" />
                    Enable Auto Renew
                  </>
                )}
              </Button>
            </form>
          </>
        )}

        {membership.status !== "CANCELLED" && (
          <div className="relative">
            <details className="group">
              <summary className="list-none cursor-pointer">
                <Button variant="destructive">Cancel Membership</Button>
              </summary>
              <div className="absolute left-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10">
                <form action={cancelMembership} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason (optional)
                    </label>
                    <textarea
                      name="cancelReason"
                      placeholder="Enter cancellation reason..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      rows={3}
                    />
                  </div>
                  <Button type="submit" variant="destructive" className="w-full">
                    Confirm Cancellation
                  </Button>
                </form>
              </div>
            </details>
          </div>
        )}

        <form action={deleteMembership} className="ml-auto">
          <ConfirmButton
            message="Are you sure you want to delete this membership? This action cannot be undone."
            variant="destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ConfirmButton>
        </form>

        <Link href="/finance/memberships">
          <Button variant="outline">Back</Button>
        </Link>
      </div>

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
    </div>
  );
}
