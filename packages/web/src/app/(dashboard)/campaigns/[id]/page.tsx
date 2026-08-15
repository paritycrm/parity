import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      ledgerCode: true,
      segments: {
        include: { tag: true },
        orderBy: { createdAt: "desc" },
      },
      events: {
        orderBy: { startDate: "desc" },
      },
      donations: {
        include: { contact: true },
        orderBy: { date: "desc" },
      },
      createdBy: true,
    },
  });

  if (!campaign) notFound();

  const allTags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
  });

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    ACTIVE: "bg-green-100 text-green-800",
    PAUSED: "bg-yellow-100 text-yellow-800",
    COMPLETED: "bg-blue-100 text-blue-800",
    CANCELLED: "bg-red-100 text-red-800",
  };

  const totalDonations = campaign.donations.reduce((sum, donation) => sum + Number(donation.amount), 0);

  async function addSegment(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const tagId = formData.get("tagId") as string;

    await prisma.campaignSegment.create({
      data: {
        campaignId: id,
        tagId,
      },
    });

    revalidatePath(`/campaigns/${id}`);
  }

  async function removeSegment(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const tagId = formData.get("tagId") as string;
    await prisma.campaignSegment.delete({
      where: {
        campaignId_tagId: {
          campaignId: id,
          tagId,
        },
      },
    });

    revalidatePath(`/campaigns/${id}`);
  }

  async function updateStatus(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const newStatus = formData.get("newStatus") as string;

    await prisma.campaign.update({
      where: { id },
      data: { status: newStatus },
    });

    revalidatePath(`/campaigns/${id}`);
  }

  async function deleteCampaign() {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    await prisma.campaign.delete({
      where: { id },
    });

    redirect("/campaigns");
  }

  const progress = campaign.budgetTarget && campaign.budgetTarget > 0
    ? Math.min(Math.round((campaign.actualRaised / campaign.budgetTarget) * 100), 100)
    : 0;
  const progressRaw = campaign.budgetTarget && campaign.budgetTarget > 0
    ? Math.round((campaign.actualRaised / campaign.budgetTarget) * 100)
    : 0;

  const segmentedTags = campaign.segments.map((s) => s.tagId);
  const availableTags = allTags.filter((tag) => !segmentedTags.includes(tag.id));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/campaigns" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Campaign Details</h1>
      </div>

      {/* Campaign Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{campaign.name}</h2>
                <p className="text-sm text-gray-500 mt-1">{campaign.description}</p>
              </div>
              <Badge className={statusColors[campaign.status]}>
                {campaign.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 py-4 border-y border-gray-100">
              <div>
                <p className="text-xs text-gray-500 uppercase">Type</p>
                <p className="text-sm font-medium text-gray-900">{campaign.type || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Start Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {campaign.startDate ? formatDate(campaign.startDate) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">End Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {campaign.endDate ? formatDate(campaign.endDate) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Budget Target</p>
                <p className="text-sm font-medium text-gray-900">
                  {campaign.budgetTarget ? `£${campaign.budgetTarget.toFixed(2)}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Actual Raised</p>
                <p className="text-sm font-medium text-gray-900">
                  £{campaign.actualRaised.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Campaign Progress */}
            {campaign.budgetTarget && campaign.budgetTarget > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Campaign Progress</p>
                  <p className="text-sm font-semibold text-gray-900">
                    £{campaign.actualRaised.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} of £{campaign.budgetTarget.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ({progressRaw}%)
                  </p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${progress >= 100 ? "bg-green-500" : progress >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <form action={updateStatus} className="flex items-center gap-2">
                <select
                  name="newStatus"
                  defaultValue={campaign.status}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <Button type="submit" size="sm">Update</Button>
              </form>

              <form action={deleteCampaign}>
                <Button variant="destructive" type="submit" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Campaign
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Segments (Tags) */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Target Segments</h3>
          </CardHeader>
          <CardContent>
            <form action={addSegment} className="space-y-3 mb-6 pb-6 border-b border-gray-100">
              <Select
                label="Add Tag"
                name="tagId"
                options={availableTags.map((tag) => ({
                  value: tag.id,
                  label: tag.name,
                }))}
                placeholder={availableTags.length === 0 ? "All tags added" : "Select tag"}
              />
              <Button type="submit" size="sm" disabled={availableTags.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> Add Segment
              </Button>
            </form>

            {campaign.segments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No segments targeting this campaign</p>
            ) : (
              <div className="space-y-2">
                {campaign.segments.map((segment) => (
                  <div
                    key={segment.tagId}
                    className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50"
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {segment.tag.name}
                    </span>
                    <form action={removeSegment}>
                      <input type="hidden" name="tagId" value={segment.tagId} />
                      <button
                        type="submit"
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Events */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Linked Events</h3>
          </CardHeader>
          <CardContent>
            {campaign.events.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No events linked to this campaign</p>
            ) : (
              <div className="space-y-2">
                {campaign.events.map((event) => (
                  <Link key={event.id} href={`/events/${event.id}`}>
                    <div className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                      <p className="text-sm font-medium text-blue-600 hover:underline">
                        {event.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(event.startDate)}
                        {event.location && ` • ${event.location}`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Donations */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Donations</h3>
        </CardHeader>
        <CardContent>
          {campaign.donations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No donations linked to this campaign</p>
          ) : (
            <div className="space-y-2">
              {campaign.donations.map((donation) => (
                <Link
                  key={donation.id}
                  href={`/finance/donations/${donation.id}`}
                >
                  <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {donation.contact.firstName} {donation.contact.lastName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(donation.date)} • {donation.type}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      £{donation.amount.toFixed(2)}
                    </p>
                  </div>
                </Link>
              ))}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-900">
                  Total: £{totalDonations.toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
