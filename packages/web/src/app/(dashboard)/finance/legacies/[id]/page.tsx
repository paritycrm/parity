import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Trash2, Edit2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PipelineTimeline } from "@/components/ui/pipeline-timeline";
import { getLegacySteps } from "@/components/ui/pipeline-steps";

export default async function LegacyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const legacy = await prisma.legacy.findUnique({
    where: { id },
    include: {
      contact: true,
      createdBy: true,
    },
  });

  if (!legacy) notFound();

  async function updateLegacyStatus(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const currentLegacy = await prisma.legacy.findUnique({ where: { id } });
    if (!currentLegacy) return;

    const status = formData.get("status") as string;
    const updateData: any = { status };

    if (status === "RECEIVED" && !currentLegacy.dateReceived) {
      updateData.dateReceived = new Date();
    }
    if (status === "PROBATE" && !currentLegacy.probateGranted) {
      updateData.probateGranted = new Date();
    }

    await prisma.legacy.update({
      where: { id },
      data: updateData,
    });

    revalidatePath(`/finance/legacies/${id}`);
  }

  async function updateLegacyDetails(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const estimatedAmount = formData.get("estimatedAmount") as string;
    const receivedAmount = formData.get("receivedAmount") as string;
    const dateOfDeath = formData.get("dateOfDeath") as string;
    const probateGranted = formData.get("probateGranted") as string;
    const dateReceived = formData.get("dateReceived") as string;
    const expectedPaymentDate = formData.get("expectedPaymentDate") as string;

    await prisma.legacy.update({
      where: { id },
      data: {
        deceasedName: formData.get("deceasedName") as string,
        type: formData.get("type") as string,
        estimatedAmount: estimatedAmount ? parseFloat(estimatedAmount) : null,
        receivedAmount: receivedAmount ? parseFloat(receivedAmount) : null,
        executorName: (formData.get("executorName") as string) || null,
        executorEmail: (formData.get("executorEmail") as string) || null,
        executorPhone: (formData.get("executorPhone") as string) || null,
        solicitorName: (formData.get("solicitorName") as string) || null,
        solicitorFirm: (formData.get("solicitorFirm") as string) || null,
        solicitorEmail: (formData.get("solicitorEmail") as string) || null,
        solicitorPhone: (formData.get("solicitorPhone") as string) || null,
        dateOfDeath: dateOfDeath ? new Date(dateOfDeath) : null,
        probateGranted: probateGranted ? new Date(probateGranted) : null,
        dateReceived: dateReceived ? new Date(dateReceived) : null,
        expectedPaymentDate: expectedPaymentDate ? new Date(expectedPaymentDate) : null,
        willReference: (formData.get("willReference") as string) || null,
        description: (formData.get("description") as string) || null,
        conditions: (formData.get("conditions") as string) || null,
        notes: (formData.get("notes") as string) || null,
      },
    });

    revalidatePath(`/finance/legacies/${id}`);
  }

  async function deleteLegacy() {
    "use server";
    const session = await requireAuth();

    await prisma.legacy.delete({
      where: { id },
    });

    revalidatePath("/finance/legacies");
    redirect("/finance/legacies");
  }

  const statusColors: Record<string, string> = {
    NOTIFIED: "bg-blue-100 text-blue-800",
    INVESTIGATING: "bg-yellow-100 text-yellow-800",
    PROBATE: "bg-yellow-100 text-yellow-800",
    AWAITING_PAYMENT: "bg-orange-100 text-orange-800",
    RECEIVED: "bg-green-100 text-green-800",
    PARTIAL: "bg-purple-100 text-purple-800",
    DISPUTED: "bg-red-100 text-red-800",
    CLOSED: "bg-gray-100 text-gray-800",
  };

  const typeOptions = [
    { value: "PECUNIARY", label: "Pecuniary" },
    { value: "RESIDUARY", label: "Residuary" },
    { value: "SPECIFIC", label: "Specific" },
    { value: "REVERSIONARY", label: "Reversionary" },
    { value: "LIFE_INTEREST", label: "Life Interest" },
  ];

  const statusOptions = [
    { value: "NOTIFIED", label: "Notified" },
    { value: "INVESTIGATING", label: "Investigating" },
    { value: "PROBATE", label: "Probate" },
    { value: "AWAITING_PAYMENT", label: "Awaiting Payment" },
    { value: "RECEIVED", label: "Received" },
    { value: "PARTIAL", label: "Partial" },
    { value: "DISPUTED", label: "Disputed" },
    { value: "CLOSED", label: "Closed" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/legacies" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Legacy Details</h1>
      </div>

      {/* Visual Pipeline Timeline */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Legacy Progress</h3>
        </CardHeader>
        <CardContent>
          <PipelineTimeline
            steps={getLegacySteps(legacy)}
            currentStepKey={
              legacy.status === "DISPUTED" || legacy.status === "PARTIAL"
                ? "AWAITING_PAYMENT"
                : legacy.status
            }
            variant="legacy"
            size="full"
          />
          {legacy.status === "DISPUTED" && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-center">
              <p className="text-sm text-red-700 font-medium">This legacy is currently under dispute</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Deceased Name</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{legacy.deceasedName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</p>
                <p className="text-sm text-gray-900 mt-1">{legacy.type}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</p>
                {legacy.contact ? (
                  <Link
                    href={`/crm/contacts/${legacy.contact.id}`}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-1 block"
                  >
                    {legacy.contact.firstName} {legacy.contact.lastName}
                  </Link>
                ) : (
                  <p className="text-sm text-gray-600 mt-1">—</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</p>
                <div className="mt-1">
                  <Badge className={statusColors[legacy.status]}>{legacy.status}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Estimated Amount</p>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {legacy.estimatedAmount
                    ? `£${Number(legacy.estimatedAmount).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Received Amount</p>
                <p className="text-sm text-gray-900 mt-1">
                  {legacy.receivedAmount
                    ? `£${Number(legacy.receivedAmount).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
                    : "—"}
                </p>
              </div>
              {legacy.expectedPaymentDate && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Payment Date</p>
                  <p className="text-sm font-medium text-indigo-600 mt-1">
                    {formatDate(legacy.expectedPaymentDate)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Solicitor Information */}
          {(legacy.solicitorName || legacy.solicitorFirm) && (
            <div className="mt-8 pt-8 border-t border-gray-100">
              <p className="text-sm font-semibold text-gray-900 mb-4">Solicitor Information</p>
              <div className="grid grid-cols-2 gap-4">
                {legacy.solicitorName && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Name</p>
                    <p className="text-sm text-gray-900 mt-1">{legacy.solicitorName}</p>
                  </div>
                )}
                {legacy.solicitorFirm && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Firm</p>
                    <p className="text-sm text-gray-900 mt-1">{legacy.solicitorFirm}</p>
                  </div>
                )}
                {legacy.solicitorEmail && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email</p>
                    <p className="text-sm text-gray-900 mt-1">{legacy.solicitorEmail}</p>
                  </div>
                )}
                {legacy.solicitorPhone && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</p>
                    <p className="text-sm text-gray-900 mt-1">{legacy.solicitorPhone}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {legacy.description && (
            <div className="mt-8 pt-8 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Description</p>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{legacy.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Status */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Update Status</h3>
        </CardHeader>
        <CardContent>
          <form action={updateLegacyStatus} className="space-y-4">
            <Select
              label="Status"
              name="status"
              required
              defaultValue={legacy.status}
              options={statusOptions}
            />
            <Button type="submit">Update Status</Button>
          </form>
        </CardContent>
      </Card>

      {/* Edit Details */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Edit Legacy Details</h3>
        </CardHeader>
        <CardContent>
          <form action={updateLegacyDetails} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Deceased Name"
                name="deceasedName"
                required
                defaultValue={legacy.deceasedName}
              />
              <Select
                label="Legacy Type"
                name="type"
                required
                defaultValue={legacy.type}
                options={typeOptions}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Estimated Amount"
                name="estimatedAmount"
                type="number"
                step="0.01"
                placeholder="£0.00"
                defaultValue={legacy.estimatedAmount || ""}
              />
              <Input
                label="Received Amount"
                name="receivedAmount"
                type="number"
                step="0.01"
                placeholder="£0.00"
                defaultValue={legacy.receivedAmount || ""}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Date Of Death"
                name="dateOfDeath"
                type="date"
                defaultValue={legacy.dateOfDeath ? legacy.dateOfDeath.toISOString().split("T")[0] : ""}
              />
              <Input
                label="Will Reference"
                name="willReference"
                placeholder="e.g. will document reference"
                defaultValue={legacy.willReference || ""}
              />
            </div>

            <div className="border-t border-gray-100 pt-6">
              <p className="text-sm font-semibold text-gray-900 mb-4">Executor Information</p>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Executor Name"
                  name="executorName"
                  placeholder="Executor name (optional)"
                  defaultValue={legacy.executorName || ""}
                />
                <Input
                  label="Executor Email"
                  name="executorEmail"
                  type="email"
                  placeholder="executor@example.com (optional)"
                  defaultValue={legacy.executorEmail || ""}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <Input
                  label="Executor Phone"
                  name="executorPhone"
                  type="tel"
                  placeholder="Phone (optional)"
                  defaultValue={legacy.executorPhone || ""}
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <p className="text-sm font-semibold text-gray-900 mb-4">Solicitor Information</p>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Solicitor Name"
                  name="solicitorName"
                  placeholder="Solicitor name (optional)"
                  defaultValue={legacy.solicitorName || ""}
                />
                <Input
                  label="Solicitor Firm"
                  name="solicitorFirm"
                  placeholder="Law firm name (optional)"
                  defaultValue={legacy.solicitorFirm || ""}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <Input
                  label="Solicitor Email"
                  name="solicitorEmail"
                  type="email"
                  placeholder="solicitor@firm.com (optional)"
                  defaultValue={legacy.solicitorEmail || ""}
                />
                <Input
                  label="Solicitor Phone"
                  name="solicitorPhone"
                  type="tel"
                  placeholder="Phone (optional)"
                  defaultValue={legacy.solicitorPhone || ""}
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <p className="text-sm font-semibold text-gray-900 mb-4">Key Dates</p>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Probate Granted Date"
                  name="probateGranted"
                  type="date"
                  defaultValue={legacy.probateGranted ? legacy.probateGranted.toISOString().split("T")[0] : ""}
                />
                <Input
                  label="Date Received"
                  name="dateReceived"
                  type="date"
                  defaultValue={legacy.dateReceived ? legacy.dateReceived.toISOString().split("T")[0] : ""}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <Input
                  label="Expected Payment Date"
                  name="expectedPaymentDate"
                  type="date"
                  defaultValue={legacy.expectedPaymentDate ? legacy.expectedPaymentDate.toISOString().split("T")[0] : ""}
                />
              </div>
            </div>

            <Input
              label="Description"
              name="description"
              placeholder="Description of the legacy..."
              defaultValue={legacy.description || ""}
            />

            <Input
              label="Conditions"
              name="conditions"
              placeholder="Any conditions attached to the legacy..."
              defaultValue={legacy.conditions || ""}
            />

            <Input
              label="Notes"
              name="notes"
              placeholder="Additional notes..."
              defaultValue={legacy.notes || ""}
            />

            <Button type="submit">
              <Edit2 className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/finance/legacies">
          <Button variant="outline">Back</Button>
        </Link>
        <form action={deleteLegacy}>
          <ConfirmButton message="Are you sure you want to delete this legacy?" variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
