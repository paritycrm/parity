import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Trash2, Edit2, Plus, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";

export default async function DonationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const donation = await prisma.donation.findUnique({
    where: { id },
    include: {
      contact: true,
      campaign: true,
      event: true,
      ledgerCode: true,
      createdBy: true,
      softCredits: { include: { contact: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!donation) notFound();

  const [contacts, campaigns, ledgerCodes, events, paymentMethods] = await Promise.all([
    prisma.contact.findMany({ orderBy: { lastName: "asc" } }),
    prisma.campaign.findMany({ orderBy: { name: "asc" } }),
    prisma.ledgerCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.event.findMany({
      where: { status: { not: "CANCELLED" } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
    }),
    prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  async function updateDonation(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const amount = parseFloat(formData.get("amount") as string);
    const isGiftAidable = (formData.get("isGiftAidable") as string) === "on";
    const newCampaignId = (formData.get("campaignId") as string) || null;

    // Get existing donation to compare campaign/amount changes
    const existing = await prisma.donation.findUnique({
      where: { id },
      select: { amount: true, campaignId: true },
    });

    await prisma.donation.update({
      where: { id },
      data: {
        contactId: formData.get("contactId") as string,
        amount,
        currency: formData.get("currency") as string,
        type: formData.get("type") as string,
        method: (formData.get("method") as string) || null,
        reference: (formData.get("reference") as string) || null,
        date: new Date(formData.get("date") as string),
        ledgerCodeId: (formData.get("ledgerCodeId") as string) || null,
        campaignId: newCampaignId,
        eventId: (formData.get("eventId") as string) || null,
        isGiftAidable,
        notes: (formData.get("notes") as string) || null,
      },
    });

    // Update campaign actualRaised if campaign or amount changed
    if (existing) {
      // Remove old amount from previous campaign
      if (existing.campaignId) {
        await prisma.campaign.update({
          where: { id: existing.campaignId },
          data: { actualRaised: { decrement: existing.amount } },
        });
        revalidatePath(`/campaigns/${existing.campaignId}`);
      }
      // Add new amount to new campaign
      if (newCampaignId) {
        await prisma.campaign.update({
          where: { id: newCampaignId },
          data: { actualRaised: { increment: amount } },
        });
        revalidatePath(`/campaigns/${newCampaignId}`);
      }
    }

    await logAudit({ userId: session.id, action: "UPDATE", entityType: "Donation", entityId: id, details: { amount, type: formData.get("type") } });

    revalidatePath(`/finance/donations/${id}`);
  }

  async function deleteDonation() {
    "use server";
    const session = await requireAuth();

    // Get donation details before deleting to update campaign total
    const existing = await prisma.donation.findUnique({
      where: { id },
      select: { amount: true, campaignId: true },
    });

    await prisma.donation.delete({
      where: { id },
    });

    // Decrement campaign actualRaised
    if (existing?.campaignId) {
      await prisma.campaign.update({
        where: { id: existing.campaignId },
        data: { actualRaised: { decrement: existing.amount } },
      });
    }

    await logAudit({ userId: session.id, action: "DELETE", entityType: "Donation", entityId: id });

    revalidatePath("/finance/donations");
    if (existing?.campaignId) revalidatePath(`/campaigns/${existing.campaignId}`);
    redirect("/finance/donations");
  }

  async function addSoftCredit(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const contactId = formData.get("contactId") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const notes = (formData.get("notes") as string) || null;

    if (!contactId || isNaN(amount) || amount <= 0) return;

    await prisma.softCredit.create({
      data: {
        donationId: id,
        contactId,
        amount,
        notes,
      },
    });

    await logAudit({ userId: session.id, action: "CREATE", entityType: "SoftCredit", entityId: id, details: { donationId: id, contactId, amount } });
    revalidatePath(`/finance/donations/${id}`);
  }

  async function deleteSoftCredit(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const softCreditId = formData.get("softCreditId") as string;
    await prisma.softCredit.delete({ where: { id: softCreditId } });

    await logAudit({ userId: session.id, action: "DELETE", entityType: "SoftCredit", entityId: softCreditId, details: { donationId: id } });
    revalidatePath(`/finance/donations/${id}`);
  }

  const typeColors: Record<string, string> = {
    DONATION: "bg-green-100 text-green-800",
    PAYMENT: "bg-blue-100 text-blue-800",
    GIFT: "bg-purple-100 text-purple-800",
    EVENT_FEE: "bg-yellow-100 text-yellow-800",
    SPONSORSHIP: "bg-orange-100 text-orange-800",
    LEGACY: "bg-indigo-100 text-indigo-800",
    GRANT: "bg-pink-100 text-pink-800",
    IN_KIND: "bg-gray-100 text-gray-800",
  };

  const statusColors: Record<string, string> = {
    RECEIVED: "bg-green-50 text-green-700",
    PENDING: "bg-yellow-50 text-yellow-700",
    REFUNDED: "bg-red-50 text-red-700",
    CANCELLED: "bg-gray-50 text-gray-700",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/donations" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Donation Details</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  £{donation.amount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</p>
                <Link
                  href={`/crm/contacts/${donation.contact.id}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-1 block"
                >
                  {donation.contact.firstName} {donation.contact.lastName}
                </Link>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date</p>
                <p className="text-sm text-gray-900 mt-1">{formatDate(donation.date)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</p>
                <div className="mt-1">
                  <Badge className={typeColors[donation.type]}>{donation.type}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</p>
                <div className="mt-1">
                  <Badge className={statusColors[donation.status]}>{donation.status}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gift Aid
                </p>
                <p className="text-sm text-gray-900 mt-1">
                  {donation.isGiftAidable ? "Eligible" : "Not eligible"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-gray-100">
            <div className="space-y-4">
              {donation.method && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Method
                  </p>
                  <p className="text-sm text-gray-900 mt-1">{donation.method}</p>
                </div>
              )}
              {donation.reference && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reference
                  </p>
                  <p className="text-sm text-gray-900 mt-1 font-mono">{donation.reference}</p>
                </div>
              )}
              {donation.ledgerCode && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ledger Code
                  </p>
                  <p className="text-sm text-gray-900 mt-1">
                    {donation.ledgerCode.code} - {donation.ledgerCode.name}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {donation.campaign && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campaign
                  </p>
                  <Link
                    href={`/campaigns/${donation.campaign.id}`}
                    className="text-sm text-indigo-600 hover:text-indigo-700 mt-1 block"
                  >
                    {donation.campaign.name}
                  </Link>
                </div>
              )}
              {donation.event && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Event
                  </p>
                  <Link
                    href={`/events/${donation.event.id}`}
                    className="text-sm text-indigo-600 hover:text-indigo-700 mt-1 block"
                  >
                    {donation.event.name}
                  </Link>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recorded by
                </p>
                <p className="text-sm text-gray-900 mt-1">{donation.createdBy.name}</p>
              </div>
            </div>
          </div>

          {donation.notes && (
            <div className="mt-8 pt-8 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</p>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{donation.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Form */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Edit Donation</h3>
        </CardHeader>
        <CardContent>
          <form action={updateDonation} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                <SearchableSelect
                  name="contactId"
                  required
                  defaultValue={donation.contactId}
                  placeholder="Search contacts..."
                  options={contacts.map((contact) => ({
                    value: contact.id,
                    label: `${contact.firstName} ${contact.lastName}`,
                  }))}
                />
              </div>
              <Input
                label="Date"
                name="date"
                type="date"
                required
                defaultValue={donation.date.toISOString().split("T")[0]}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Amount"
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={Number(donation.amount)}
              />
              <Select
                label="Currency"
                name="currency"
                defaultValue={donation.currency}
                options={[{ value: "GBP", label: "GBP (£)" }]}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Type"
                name="type"
                required
                defaultValue={donation.type}
                options={[
                  { value: "DONATION", label: "Donation" },
                  { value: "PAYMENT", label: "Payment" },
                  { value: "GIFT", label: "Gift" },
                  { value: "EVENT_FEE", label: "Event Fee" },
                  { value: "SPONSORSHIP", label: "Sponsorship" },
                  { value: "LEGACY", label: "Legacy" },
                  { value: "GRANT", label: "Grant" },
                  { value: "IN_KIND", label: "In Kind" },
                ]}
              />
              <Select
                label="Method"
                name="method"
                placeholder="Select method (optional)"
                defaultValue={donation.method || ""}
                options={paymentMethods.map((pm) => ({
                  value: pm.name,
                  label: pm.name,
                }))}
              />
            </div>

            <Input
              label="Reference"
              name="reference"
              placeholder="e.g. receipt number"
              defaultValue={donation.reference || ""}
            />

            <Select
              label="Ledger Code"
              name="ledgerCodeId"
              placeholder="Select code (optional)"
              defaultValue={donation.ledgerCodeId || ""}
              options={ledgerCodes.map((code) => ({
                value: code.id,
                label: `${code.code} - ${code.name}`,
              }))}
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Campaign"
                name="campaignId"
                placeholder="Select campaign (optional)"
                defaultValue={donation.campaignId || ""}
                options={campaigns.map((campaign) => ({
                  value: campaign.id,
                  label: campaign.name,
                }))}
              />
              <Select
                label="Event"
                name="eventId"
                placeholder="Select event (optional)"
                defaultValue={donation.eventId || ""}
                options={events.map((event) => ({
                  value: event.id,
                  label: event.name,
                }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isGiftAidable"
                name="isGiftAidable"
                className="rounded border-gray-300"
                defaultChecked={donation.isGiftAidable}
              />
              <label htmlFor="isGiftAidable" className="text-sm font-medium text-gray-700">
                Eligible for Gift Aid
              </label>
            </div>

            <Input
              label="Notes"
              name="notes"
              placeholder="Additional notes..."
              defaultValue={donation.notes || ""}
            />

            <Button type="submit">
              <Edit2 className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Soft Credits */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">Soft Credits</h3>
            {donation.softCredits.length > 0 && (
              <span className="ml-1 rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-xs font-medium">
                {donation.softCredits.length}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Existing soft credits */}
          {donation.softCredits.length > 0 ? (
            <div className="space-y-2 mb-6 pb-6 border-b border-gray-100">
              {donation.softCredits.map((sc: any) => (
                <div key={sc.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/crm/contacts/${sc.contact.id}`}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {sc.contact.firstName} {sc.contact.lastName}
                    </Link>
                    <span className="text-sm font-semibold text-gray-900">
                      &pound;{Number(sc.amount).toFixed(2)}
                    </span>
                    {sc.notes && (
                      <span className="text-xs text-gray-500">{sc.notes}</span>
                    )}
                  </div>
                  <form action={deleteSoftCredit}>
                    <input type="hidden" name="softCreditId" value={sc.id} />
                    <ConfirmButton message="Remove this soft credit?" variant="ghost" size="sm" className="text-red-500 text-xs">
                      <Trash2 className="h-3.5 w-3.5" />
                    </ConfirmButton>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-6 pb-6 border-b border-gray-100">
              No soft credits recorded. Use the form below to credit another contact for this donation.
            </p>
          )}

          {/* Add soft credit form */}
          <form action={addSoftCredit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                <SearchableSelect
                  name="contactId"
                  required
                  placeholder="Search contacts..."
                  options={contacts.map((contact) => ({
                    value: contact.id,
                    label: `${contact.firstName} ${contact.lastName}`,
                  }))}
                />
              </div>
              <Input
                label="Amount"
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={Number(donation.amount)}
              />
            </div>
            <Input
              label="Notes"
              name="notes"
              placeholder="e.g. solicited by this contact"
            />
            <Button type="submit" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Soft Credit
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/finance/donations">
          <Button variant="outline">Back</Button>
        </Link>
        <form
          action={deleteDonation}
        >
          <ConfirmButton message="Are you sure you want to delete this donation?" variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
