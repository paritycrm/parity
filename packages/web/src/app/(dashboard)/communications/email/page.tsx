import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  Mail,
  Send,
  Users,
  Filter,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { EmailComposeForm } from "./email-compose-form";

export default async function EmailCommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    audienceType?: string;
    eventTypeId?: string;
    eventId?: string;
    attendeeStatus?: string;
    count?: string;
    failed?: string;
  }>;
}) {
  const session = await getSession();
  if (!session || !["ADMIN", "STAFF"].includes(session.role)) redirect("/login");

  const params = await searchParams;

  // Fetch data for filters
  const [eventTypes, events, templates] = await Promise.all([
    prisma.eventType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.event.findMany({
      orderBy: { startDate: "desc" },
      take: 100,
      include: { eventType: true, _count: { select: { attendees: true } } },
    }),
    prisma.emailTemplate.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  // Build audience preview based on filters
  let audienceCount = 0;
  let audienceContacts: { id: string; firstName: string; lastName: string; email: string | null }[] = [];
  const audienceType = params.audienceType || "";

  const contactSelect = { id: true, firstName: true, lastName: true, email: true } as const;

  if (audienceType === "event-type" && params.eventTypeId) {
    const contacts = await prisma.contact.findMany({
      where: {
        isArchived: false,
        email: { not: null },
        NOT: { email: "" },
        eventAttendees: {
          some: {
            event: { eventTypeId: params.eventTypeId },
            ...(params.attendeeStatus ? { status: params.attendeeStatus } : {}),
          },
        },
      },
      select: contactSelect,
      orderBy: { firstName: "asc" },
    });
    audienceContacts = contacts;
    audienceCount = contacts.length;
  } else if (audienceType === "specific-event" && params.eventId) {
    const contacts = await prisma.contact.findMany({
      where: {
        isArchived: false,
        email: { not: null },
        NOT: { email: "" },
        eventAttendees: {
          some: {
            eventId: params.eventId,
            ...(params.attendeeStatus ? { status: params.attendeeStatus } : {}),
          },
        },
      },
      select: contactSelect,
      orderBy: { firstName: "asc" },
    });
    audienceContacts = contacts;
    audienceCount = contacts.length;
  } else if (audienceType === "all-with-email") {
    audienceCount = await prisma.contact.count({
      where: { isArchived: false, email: { not: null }, NOT: { email: "" } },
    });
  }

  // Filtered events by type
  const filteredEvents = params.eventTypeId
    ? events.filter((e) => e.eventTypeId === params.eventTypeId)
    : events;

  async function sendEmails(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s || !["ADMIN", "STAFF"].includes(s.role)) redirect("/login");

    const aType = formData.get("audienceType") as string;
    const eTypeId = formData.get("eventTypeId") as string;
    const eId = formData.get("eventId") as string;
    const aStatus = formData.get("attendeeStatus") as string;
    const subject = formData.get("subject") as string;
    const body = formData.get("body") as string;

    if (!subject || !body) return;

    const sel = { id: true, firstName: true, lastName: true, email: true } as const;
    let recipients: { id: string; firstName: string; lastName: string; email: string }[] = [];

    const eventFilter = (typeId?: string, eventId?: string, status?: string) => ({
      isArchived: false,
      email: { not: null } as const,
      NOT: { email: "" },
      eventAttendees: {
        some: {
          ...(typeId ? { event: { eventTypeId: typeId } } : {}),
          ...(eventId ? { eventId } : {}),
          ...(status ? { status } : {}),
        },
      },
    });

    if (aType === "event-type" && eTypeId) {
      recipients = (await prisma.contact.findMany({
        where: eventFilter(eTypeId, undefined, aStatus || undefined),
        select: sel,
      })).filter((c): c is typeof c & { email: string } => c.email !== null);
    } else if (aType === "specific-event" && eId) {
      recipients = (await prisma.contact.findMany({
        where: eventFilter(undefined, eId, aStatus || undefined),
        select: sel,
      })).filter((c): c is typeof c & { email: string } => c.email !== null);
    } else if (aType === "all-with-email") {
      recipients = (await prisma.contact.findMany({
        where: { isArchived: false, email: { not: null }, NOT: { email: "" } },
        select: sel,
        take: 500,
      })).filter((c): c is typeof c & { email: string } => c.email !== null);
    }

    if (recipients.length === 0) return;

    const { sendEmail } = await import("@/lib/email");
    let sent = 0;
    let failed = 0;

    for (const r of recipients) {
      try {
        const displayName = `${r.firstName} ${r.lastName}`.trim() || "there";
        const personalBody = body.replace(/\{\{name\}\}/g, displayName);
        await sendEmail({
          to: r.email,
          subject,
          html: personalBody.replace(/\n/g, "<br>"),
          text: personalBody,
        });
        sent++;
      } catch {
        failed++;
      }
    }

    await prisma.notification.create({
      data: {
        recipientId: s.id,
        type: "EMAIL_CAMPAIGN",
        title: `Email sent: "${subject}"`,
        body: `Sent to ${sent} recipients (${failed} failed)`,
        channel: "IN_APP",
        status: "SENT",
        sentAt: new Date(),
      },
    });

    revalidatePath("/communications/email");
    redirect(`/communications/email?step=sent&count=${sent}&failed=${failed}`);
  }

  const fullName = (c: { firstName: string; lastName: string }) =>
    `${c.firstName} ${c.lastName}`.trim();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/communications/sms" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="h-6 w-6" /> Email Communications
          </h1>
          <p className="text-gray-500 mt-1">Send targeted emails based on event participation</p>
        </div>
        <Link href="/communications/email/history">
          <Button variant="outline" className="gap-2">
            <Clock className="h-4 w-4" />
            Campaign History
          </Button>
        </Link>
      </div>

      {/* Step 1: Build Audience */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Filter className="h-5 w-5" /> Build Your Audience
          </h2>

          <form className="space-y-4">
            <input type="hidden" name="step" value="audience" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Audience Type"
                name="audienceType"
                defaultValue={audienceType}
                options={[
                  { value: "event-type", label: "By Event Type (e.g. all runners)" },
                  { value: "specific-event", label: "By Specific Event" },
                  { value: "all-with-email", label: "All Contacts with Email" },
                ]}
              />

              {(audienceType === "event-type" || audienceType === "specific-event") && (
                <Select
                  label="Event Type"
                  name="eventTypeId"
                  defaultValue={params.eventTypeId || ""}
                  placeholder="All event types"
                  options={eventTypes.map((et) => ({
                    value: et.id,
                    label: et.name,
                  }))}
                />
              )}
            </div>

            {audienceType === "specific-event" && (
              <Select
                label="Event"
                name="eventId"
                defaultValue={params.eventId || ""}
                placeholder="Select an event"
                options={filteredEvents.map((e) => ({
                  value: e.id,
                  label: `${e.name} (${formatDate(e.startDate)}) — ${e._count.attendees} attendees`,
                }))}
              />
            )}

            {(audienceType === "event-type" || audienceType === "specific-event") && (
              <Select
                label="Attendee Status"
                name="attendeeStatus"
                defaultValue={params.attendeeStatus || ""}
                placeholder="Any status"
                options={[
                  { value: "REGISTERED", label: "Registered" },
                  { value: "CONFIRMED", label: "Confirmed" },
                  { value: "ATTENDED", label: "Attended" },
                  { value: "NO_SHOW", label: "No Show" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
              />
            )}

            <Button type="submit" variant="outline" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Preview Audience
            </Button>
          </form>

          {/* Audience preview */}
          {audienceCount > 0 && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-semibold text-green-800">
                <Users className="h-4 w-4 inline mr-1" />
                {audienceCount} contact{audienceCount !== 1 ? "s" : ""} matched
              </p>
              {audienceContacts.length > 0 && audienceContacts.length <= 20 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {audienceContacts.map((c) => (
                    <span key={c.id} className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs text-gray-700 border">
                      {fullName(c)}
                    </span>
                  ))}
                </div>
              )}
              {audienceContacts.length > 20 && (
                <p className="text-xs text-green-700 mt-1">
                  Showing first 20: {audienceContacts.slice(0, 20).map((c) => fullName(c)).join(", ")}...
                </p>
              )}
            </div>
          )}
          {audienceType && audienceCount === 0 && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">No contacts match this audience filter. Try adjusting your criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Compose Email */}
      {audienceCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Send className="h-5 w-5" /> Compose Email
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Use <code className="bg-gray-100 px-1 rounded text-xs">{"{{name}}"}</code> to personalise with the contact&apos;s name.
            </p>

            <EmailComposeForm
              audienceType={audienceType}
              eventTypeId={params.eventTypeId || ""}
              eventId={params.eventId || ""}
              attendeeStatus={params.attendeeStatus || ""}
              audienceCount={audienceCount}
              templates={templates.map((t) => ({ id: t.id, name: t.name }))}
              sendAction={sendEmails}
            />
          </CardContent>
        </Card>
      )}

      {/* Success message */}
      {params.step === "sent" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <p className="text-green-800 font-semibold">
              Emails sent successfully! {params.count} delivered{params.failed && parseInt(params.failed) > 0 ? `, ${params.failed} failed` : ""}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
