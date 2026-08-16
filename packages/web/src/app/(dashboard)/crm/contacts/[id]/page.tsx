import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Building2, Plus, Heart, Users, Edit3, Trash2, Archive, ArchiveX, Ticket, PoundSterling, Calendar, Tag, Crown, Package, Award, Clock, Shield, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { logAudit } from "@/lib/audit";
import { getSystemSettings } from "@/lib/settings";
import { extractJGSlug, buildJGUrl } from "@/lib/justgiving";
import { JustGivingSyncButton } from "@/components/ui/justgiving-sync";
import { GiftAidShield } from "@/components/ui/gift-aid-shield";
import { ContactTabs } from "./contact-tabs";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      organisation: true,
      tags: { include: { tag: true } },
      notes: { include: { createdBy: true }, orderBy: { createdAt: "desc" } },
      interactions: { include: { createdBy: true }, orderBy: { date: "desc" } },
      volunteerProfile: {
        include: {
          departments: { include: { department: true } },
          skills: { include: { skill: true } },
          hoursLogs: { orderBy: { date: "desc" as const } },
          assignments: { include: { department: true }, orderBy: { date: "desc" as const }, take: 10 },
          trainings: { include: { course: true }, orderBy: { createdAt: "desc" as const } },
          dbsChecks: { orderBy: { createdAt: "desc" as const } },
          drivingLicence: true,
          onboardingSteps: { orderBy: { createdAt: "asc" as const } },
        },
      },
      giftAids: { orderBy: { createdAt: "desc" }, take: 5 },
      donations: { include: { campaign: true, event: true }, orderBy: { date: "desc" } },
      softCredits: { include: { donation: { include: { contact: true } } }, orderBy: { createdAt: "desc" } },
      eventAttendees: { include: { event: true }, orderBy: { createdAt: "desc" }, take: 5 },
      eventOrders: { include: { event: true, lineItems: { include: { item: true } } }, orderBy: { createdAt: "desc" }, take: 5 },
      fundraisingPages: {
        include: {
          event: true,
          donations: { orderBy: { donationDate: "desc" }, take: 10 },
        },
        orderBy: { createdAt: "desc" },
      },
      relationshipsFrom: { include: { toContact: true } },
      relationshipsTo: { include: { fromContact: true } },
    },
  });

  if (!contact) notFound();

  const systemSettings = await getSystemSettings();

  const allContacts = await prisma.contact.findMany({
    where: { id: { not: id } },
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });

  const allOrganisations = await prisma.organisation.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const allEvents = await prisma.event.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true },
    take: 50,
  });

  // Fetch all training courses for enrolment dropdown (only if volunteer)
  const allTrainingCourses = contact.volunteerProfile
    ? await prisma.trainingCourse.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  // IDs already enrolled so we can filter them out
  const enrolledCourseIds = new Set(contact.volunteerProfile?.trainings.map((t: any) => t.courseId) ?? []);
  const availableCourses = allTrainingCourses.filter((c) => !enrolledCourseIds.has(c.id));

  // -- Server Actions --

  async function addFundraisingPage(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const pageUrlInput = (formData.get("pageUrl") as string)?.trim();
    const eventId = (formData.get("eventId") as string) || null;
    const title = (formData.get("title") as string)?.trim() || null;

    if (!pageUrlInput) return;

    const pageSlug = extractJGSlug(pageUrlInput);
    const pageUrl = pageUrlInput.startsWith("http")
      ? pageUrlInput
      : buildJGUrl(pageSlug);

    await prisma.fundraisingPage.create({
      data: {
        contactId: id,
        eventId: eventId || null,
        platform: "JUSTGIVING",
        pageUrl,
        pageSlug,
        title,
      },
    });

    await logAudit({ userId: session.id, action: "CREATE", entityType: "FundraisingPage", entityId: id, details: { pageSlug, contactId: id } });
    revalidatePath(`/crm/contacts/${id}`);
  }

  async function removeFundraisingPage(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const pageId = formData.get("pageId") as string;
    await prisma.fundraisingPage.delete({ where: { id: pageId } });

    await logAudit({ userId: session.id, action: "DELETE", entityType: "FundraisingPage", entityId: pageId });
    revalidatePath(`/crm/contacts/${id}`);
  }

  async function addNote(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    await prisma.note.create({
      data: {
        contactId: id,
        content: formData.get("content") as string,
        createdById: session.id,
      },
    });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function addInteraction(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    await prisma.interaction.create({
      data: {
        contactId: id,
        type: formData.get("type") as string,
        subject: formData.get("subject") as string,
        description: (formData.get("description") as string) || null,
        date: new Date(),
        createdById: session.id,
      },
    });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function updateConsent(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const currentContact = await prisma.contact.findUnique({
      where: { id },
      select: {
        consentPost: true,
        consentEmail: true,
        consentPhone: true,
        consentSms: true,
      },
    });

    if (!currentContact) {
      redirect(`/crm/contacts/${id}`);
    }

    const newConsent = {
      consentPost: formData.get("consentPost") === "on",
      consentEmail: formData.get("consentEmail") === "on",
      consentPhone: formData.get("consentPhone") === "on",
      consentSms: formData.get("consentSms") === "on",
    };

    const consentChanges = [
      { type: "POST", old: currentContact.consentPost, new: newConsent.consentPost },
      { type: "EMAIL", old: currentContact.consentEmail, new: newConsent.consentEmail },
      { type: "PHONE", old: currentContact.consentPhone, new: newConsent.consentPhone },
      { type: "SMS", old: currentContact.consentSms, new: newConsent.consentSms },
    ];

    for (const change of consentChanges) {
      if (change.old !== change.new) {
        await prisma.consentRecord.create({
          data: {
            contactId: id,
            consentType: change.type,
            action: change.new ? "GRANTED" : "WITHDRAWN",
            previousValue: change.old,
            newValue: change.new,
            source: "WEB_PORTAL",
            recordedById: session.id,
          },
        });
      }
    }

    await prisma.contact.update({
      where: { id },
      data: {
        consentPost: newConsent.consentPost,
        consentEmail: newConsent.consentEmail,
        consentPhone: newConsent.consentPhone,
        consentSms: newConsent.consentSms,
        consentUpdatedAt: new Date(),
      },
    });
    await logAudit({ userId: session.id, action: "UPDATE", entityType: "Contact", entityId: id, details: { consent: newConsent } });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function createVolunteerProfile() {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const existing = await prisma.volunteerProfile.findUnique({
      where: { contactId: id },
    });
    if (existing) {
      revalidatePath(`/crm/contacts/${id}`);
      redirect(`/crm/contacts/${id}`);
      return;
    }

    await prisma.volunteerProfile.create({
      data: {
        contactId: id,
        status: "ACTIVE",
      },
    });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function updateVolunteerProfile(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const motivation = (formData.get("motivation") as string) || null;
    const status = (formData.get("volunteerStatus") as string) || "ACTIVE";
    const startDate = (formData.get("startDate") as string) || null;
    const desiredHoursPerWeek = formData.get("desiredHoursPerWeek") ? parseFloat(formData.get("desiredHoursPerWeek") as string) : null;

    const profile = await prisma.volunteerProfile.findUnique({ where: { contactId: id } });
    if (!profile) return;

    await prisma.volunteerProfile.update({
      where: { id: profile.id },
      data: { motivation, status, startDate, desiredHoursPerWeek },
    });
    await logAudit({ userId: session.id, action: "UPDATE", entityType: "VolunteerProfile", entityId: profile.id, details: { motivation, status } });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function enrolTraining(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const courseId = formData.get("courseId") as string;
    if (!courseId) return;

    const profile = await prisma.volunteerProfile.findUnique({ where: { contactId: id } });
    if (!profile) return;

    // Upsert in case they were previously enrolled (unique constraint on volunteerId+courseId)
    await prisma.volunteerTraining.upsert({
      where: { volunteerId_courseId: { volunteerId: profile.id, courseId } },
      create: { volunteerId: profile.id, courseId, status: "NOT_STARTED" },
      update: { status: "NOT_STARTED", completedDate: null, expiryDate: null },
    });
    await logAudit({ userId: session.id, action: "CREATE", entityType: "VolunteerTraining", entityId: courseId, details: { contactId: id, courseId } });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function updateTrainingStatus(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const trainingId = formData.get("trainingId") as string;
    const status = formData.get("status") as string;
    if (!trainingId || !status) return;

    const data: any = { status };
    if (status === "COMPLETED") {
      data.completedDate = new Date();
      // Calculate expiry from course validity
      const training = await prisma.volunteerTraining.findUnique({ where: { id: trainingId }, include: { course: true } });
      if (training?.course.validityMonths) {
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + training.course.validityMonths);
        data.expiryDate = expiry;
      }
    }

    await prisma.volunteerTraining.update({ where: { id: trainingId }, data });
    await logAudit({ userId: session.id, action: "UPDATE", entityType: "VolunteerTraining", entityId: trainingId, details: { status } });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function removeTraining(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const trainingId = formData.get("trainingId") as string;
    if (!trainingId) return;

    await prisma.volunteerTraining.delete({ where: { id: trainingId } });
    await logAudit({ userId: session.id, action: "DELETE", entityType: "VolunteerTraining", entityId: trainingId, details: { contactId: id } });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function addRelationship(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const toContactId = formData.get("toContactId") as string;
    const type = formData.get("relType") as string;
    if (!toContactId || !type) return;

    await prisma.contactRelationship.create({
      data: {
        fromContactId: id,
        toContactId,
        type,
      },
    });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function removeRelationship(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const relId = formData.get("relationshipId") as string;
    await prisma.contactRelationship.delete({ where: { id: relId } });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function updateContact(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const selectedTypes = formData.getAll("types") as string[];
    const isLotteryMember = formData.get("isLotteryMember") === "on";

    const currentContact = await prisma.contact.findUnique({
      where: { id },
      select: { isLotteryMember: true },
    });

    await prisma.contact.update({
      where: { id },
      data: {
        firstName: formData.get("firstName") as string,
        lastName: formData.get("lastName") as string,
        email: (formData.get("email") as string) || null,
        phone: (formData.get("phone") as string) || null,
        type: selectedTypes[0] || "OTHER",
        types: selectedTypes,
        isLotteryMember,
        lotteryMemberSince: isLotteryMember && !currentContact?.isLotteryMember ? new Date() : undefined,
        dateOfBirth: (formData.get("dateOfBirth") as string) || null,
        addressLine1: (formData.get("addressLine1") as string) || null,
        city: (formData.get("city") as string) || null,
        postcode: (formData.get("postcode") as string) || null,
        country: (formData.get("country") as string) || null,
        organisationId: (formData.get("organisationId") as string) || null,
      },
    });
    await logAudit({ userId: session.id, action: "UPDATE", entityType: "Contact", entityId: id, details: { firstName: formData.get("firstName"), lastName: formData.get("lastName"), types: selectedTypes } });

    if (selectedTypes.includes("VOLUNTEER")) {
      const existing = await prisma.volunteerProfile.findUnique({
        where: { contactId: id },
      });
      if (!existing) {
        await prisma.volunteerProfile.create({
          data: {
            contactId: id,
            status: "ACTIVE",
          },
        });
      }
    }

    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  async function deleteContact() {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const deletedContact = await prisma.contact.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
    await prisma.contact.delete({
      where: { id },
    });
    await logAudit({ userId: session.id, action: "DELETE", entityType: "Contact", entityId: id, details: { name: `${deletedContact?.firstName} ${deletedContact?.lastName}` } });
    redirect("/crm/contacts");
  }

  async function toggleArchive() {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const currentContact = await prisma.contact.findUnique({
      where: { id },
      select: { isArchived: true },
    });

    if (!currentContact) redirect("/crm/contacts");

    const newArchived = !currentContact.isArchived;
    await prisma.contact.update({
      where: { id },
      data: {
        isArchived: newArchived,
        archivedAt: newArchived ? new Date() : null,
      },
    });
    await logAudit({ userId: session.id, action: "ARCHIVE", entityType: "Contact", entityId: id, details: { archived: newArchived } });
    revalidatePath(`/crm/contacts/${id}`);
    redirect(`/crm/contacts/${id}`);
  }

  // -- Computed values --

  const lifetimeDonationTotal = contact.donations.reduce((sum, d) => sum + Number(d.amount), 0);
  const isGoldDonor = lifetimeDonationTotal >= Number(systemSettings.goldDonorThreshold);

  const typeColors: Record<string, string> = {
    DONOR: "bg-green-100 text-green-800",
    VOLUNTEER: "bg-indigo-100 text-indigo-800",
  };

  const interactionIcons: Record<string, string> = {
    EMAIL: "\u{1F4E7}",
    CALL: "\u{1F4DE}",
    MEETING: "\u{1F91D}",
    NOTE: "\u{1F4DD}",
    DONATION: "\u{1F4B0}",
    LETTER: "✉️",
    EVENT: "\u{1F3EA}",
    TASK: "✅",
    OTHER: "\u{1F4CB}",
  };

  const relationships = [
    ...contact.relationshipsFrom.map((r) => ({
      id: r.id,
      type: r.type,
      contact: r.toContact,
      direction: "to" as const,
    })),
    ...contact.relationshipsTo.map((r) => ({
      id: r.id,
      type: r.type,
      contact: r.fromContact,
      direction: "from" as const,
    })),
  ];

  // -- JSX --

  const overviewContent = (
    <div className="space-y-6">
      {/* Edit Contact Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            <h3 className="text-lg font-semibold text-gray-900">Edit Contact</h3>
          </div>
        </CardHeader>
        <CardContent>
          <form action={updateContact} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <Input name="firstName" defaultValue={contact.firstName} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <Input name="lastName" defaultValue={contact.lastName} required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <Input name="email" type="email" defaultValue={contact.email || ""} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <Input name="phone" defaultValue={contact.phone || ""} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Type(s)</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" name="types" value="VOLUNTEER" defaultChecked={contact.types.includes("VOLUNTEER")} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    Volunteer
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" name="types" value="DONOR" defaultChecked={contact.types.includes("DONOR")} className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                    Donor
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" name="isLotteryMember" defaultChecked={contact.isLotteryMember} className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                    Lottery Member
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                <Input name="dateOfBirth" type="date" defaultValue={contact.dateOfBirth || ""} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                <Input name="addressLine1" defaultValue={contact.addressLine1 || ""} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <Input name="city" defaultValue={contact.city || ""} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                <Input name="postcode" defaultValue={contact.postcode || ""} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <Input name="country" defaultValue={contact.country || ""} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organisation</label>
              <SearchableSelect
                name="organisationId"
                defaultValue={contact.organisationId || ""}
                placeholder="Select organisation..."
                options={allOrganisations.map((org) => ({ value: org.id, label: org.name }))}
              />
            </div>

            <Button type="submit" className="w-full">Update Contact</Button>
          </form>
        </CardContent>
      </Card>

      {/* Consent & Relationships row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Communication Consent */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Communication Consent</h3>
          </CardHeader>
          <CardContent>
            <form action={updateConsent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="consentPost" defaultChecked={contact.consentPost} className="rounded border-gray-300" />
                  Post
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="consentEmail" defaultChecked={contact.consentEmail} className="rounded border-gray-300" />
                  Email
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="consentPhone" defaultChecked={contact.consentPhone} className="rounded border-gray-300" />
                  Phone
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="consentSms" defaultChecked={contact.consentSms} className="rounded border-gray-300" />
                  SMS
                </label>
              </div>
              {contact.consentUpdatedAt && (
                <p className="text-xs text-gray-400">
                  Last updated: {formatDate(contact.consentUpdatedAt)}
                </p>
              )}
              <Button type="submit" size="sm">Update Consent</Button>
            </form>
          </CardContent>
        </Card>

        {/* Relationships */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Relationships</h3>
          </CardHeader>
          <CardContent>
            <form action={addRelationship} className="space-y-3 mb-4 pb-4 border-b border-gray-100">
              <div className="grid grid-cols-2 gap-3">
                <SearchableSelect
                  name="toContactId"
                  required
                  placeholder="Select contact..."
                  options={allContacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
                />
                <select name="relType" required className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Relationship type...</option>
                  <option value="SPOUSE">Spouse</option>
                  <option value="PARENT">Parent</option>
                  <option value="CHILD">Child</option>
                  <option value="SIBLING">Sibling</option>
                  <option value="EMPLOYER">Employer</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="FRIEND">Friend</option>
                  <option value="GUARDIAN">Guardian</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Relationship
              </Button>
            </form>
            {relationships.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No relationships recorded</p>
            ) : (
              <div className="space-y-2">
                {relationships.map((rel) => (
                  <div key={rel.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-gray-400" />
                      <Link href={`/crm/contacts/${rel.contact.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                        {rel.contact.firstName} {rel.contact.lastName}
                      </Link>
                      <Badge variant="outline">{rel.type}</Badge>
                    </div>
                    <form action={removeRelationship}>
                      <input type="hidden" name="relationshipId" value={rel.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-red-500 text-xs">
                        Remove
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Financial summary row */}
      {(contact.donations.length > 0 || contact.giftAids.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {contact.donations.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Recent Donations</h3>
                  <Link href="/finance/donations" className="text-sm text-indigo-600 hover:underline">View All</Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contact.donations.map((d) => (
                    <Link key={d.id} href={`/finance/donations/${d.id}`} className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{d.type}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(d.date)}
                          {d.campaign && <span className="text-indigo-600"> &middot; {d.campaign.name}</span>}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">&pound;{Number(d.amount).toFixed(2)}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {contact.giftAids.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Gift Aid Declarations</h3>
                  <Link href="/finance/gift-aid" className="text-sm text-indigo-600 hover:underline">View All</Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contact.giftAids.map((ga) => (
                    <Link key={ga.id} href={`/finance/gift-aid/${ga.id}`} className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {formatDate(ga.startDate)} &mdash; {ga.endDate ? formatDate(ga.endDate) : "Ongoing"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {ga.type === "RETAIL" ? "Retail Gift Aid" : "Standard Gift Aid"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <GiftAidShield type={ga.type === "RETAIL" ? "R" : "S"} />
                        <Badge className={
                          ga.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                          ga.status === "EXPIRED" ? "bg-yellow-100 text-yellow-800" :
                          "bg-red-100 text-red-800"
                        }>{ga.status}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Event Registrations & Orders */}
      {(contact.eventAttendees.length > 0 || contact.eventOrders.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {contact.eventAttendees.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Event Registrations</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contact.eventAttendees.map((ea) => (
                    <Link key={ea.id} href={`/events/${ea.event.id}`} className="flex items-center justify-between py-2 hover:bg-gray-50 rounded px-2 -mx-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{ea.event.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(ea.event.startDate)}
                          {ea.event.location ? ` • ${ea.event.location}` : ""}
                        </p>
                      </div>
                      <Badge className={
                        ea.status === "CONFIRMED" || ea.status === "ATTENDED" ? "bg-green-100 text-green-800" :
                        ea.status === "REGISTERED" ? "bg-blue-100 text-blue-800" :
                        ea.status === "CANCELLED" || ea.status === "NO_SHOW" ? "bg-red-100 text-red-800" :
                        "bg-gray-100 text-gray-800"
                      }>{ea.status}</Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {contact.eventOrders.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Event Orders</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {contact.eventOrders.map((order) => (
                    <div key={order.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{order.event.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{order.orderNumber}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">&pound;{Number(order.totalAmount).toFixed(2)}</p>
                          <Badge className={
                            order.paymentStatus === "PAID" || order.paymentStatus === "FREE" ? "bg-green-100 text-green-800" :
                            order.paymentStatus === "UNPAID" ? "bg-yellow-100 text-yellow-800" :
                            "bg-red-100 text-red-800"
                          }>{order.paymentStatus}</Badge>
                        </div>
                      </div>
                      {order.lineItems.length > 0 && (
                        <div className="mt-2 text-xs text-gray-600">
                          {order.lineItems.map((li) => (
                            <span key={li.id} className="mr-2">
                              {li.item.name}{li.quantity > 1 ? ` x${li.quantity}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {order.giftAidDeclared && Number(order.giftAidTotal) > 0 && (
                        <p className="text-xs text-amber-700 mt-1">
                          Gift Aid: &pound;{(Number(order.giftAidTotal) * 0.25).toFixed(2)} claimable
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Fundraising Pages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Fundraising Pages</h3>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contact.fundraisingPages.length > 0 ? (
            <div className="space-y-4 mb-6">
              {contact.fundraisingPages.map((fp) => (
                <div key={fp.id} className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <a href={fp.pageUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-purple-700 hover:underline">
                          {fp.title || fp.pageSlug}
                        </a>
                        <Badge className="bg-purple-100 text-purple-800 text-xs">{fp.platform}</Badge>
                        {fp.isActive && <Badge className="bg-green-100 text-green-800 text-xs">Active</Badge>}
                      </div>
                      {fp.event && (
                        <p className="text-xs text-gray-500 mt-1">
                          Linked to event: <Link href={`/events/${fp.event.id}`} className="text-blue-600 hover:underline">{fp.event.name}</Link>
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <div>
                          <p className="text-xl font-bold text-purple-700">&pound;{Number(fp.totalRaised).toFixed(2)}</p>
                          <p className="text-xs text-gray-500">raised</p>
                        </div>
                        {fp.targetAmount && Number(fp.targetAmount) > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700">of &pound;{Number(fp.targetAmount).toFixed(2)}</p>
                            <div className="w-32 h-2 bg-gray-200 rounded-full mt-1">
                              <div className="h-2 bg-purple-600 rounded-full" style={{ width: `${Math.min(100, (Number(fp.totalRaised) / Number(fp.targetAmount)) * 100)}%` }} />
                            </div>
                          </div>
                        )}
                        {Number(fp.giftAidTotal) > 0 && (
                          <div>
                            <p className="text-sm font-medium text-amber-700">+&pound;{Number(fp.giftAidTotal).toFixed(2)}</p>
                            <p className="text-xs text-gray-500">gift aid</p>
                          </div>
                        )}
                      </div>
                      {fp.lastSyncAt && (
                        <p className="text-xs text-gray-400 mt-2">Last synced: {formatDate(fp.lastSyncAt)}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <JustGivingSyncButton fundraisingPageId={fp.id} />
                      <form action={removeFundraisingPage}>
                        <input type="hidden" name="pageId" value={fp.id} />
                        <button type="submit" className="text-xs text-red-500 hover:text-red-700 underline">Remove</button>
                      </form>
                    </div>
                  </div>

                  {fp.donations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-purple-200">
                      <p className="text-xs font-medium text-gray-600 mb-2">Recent donations:</p>
                      <div className="space-y-1">
                        {fp.donations.slice(0, 5).map((d) => (
                          <div key={d.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-700">{d.donorDisplayName || "Anonymous"}</span>
                              <span className="text-gray-400">{formatDate(d.donationDate)}</span>
                            </div>
                            <span className="font-bold text-purple-700">&pound;{Number(d.amount).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-4">No fundraising pages linked yet. Add a JustGiving page URL below.</p>
          )}

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Add a fundraising page</p>
            <form action={addFundraisingPage} className="space-y-3">
              <Input name="pageUrl" placeholder="Paste JustGiving URL e.g. justgiving.com/fundraising/ross-bike-ride" required />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input name="title" placeholder="Page title (optional, fetched on sync)" />
                <select name="eventId" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Link to event (optional)</option>
                  {allEvents.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="sm" className="bg-purple-600 hover:bg-purple-700">
                <Plus className="h-4 w-4 mr-2" /> Add Page
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const donationsContent = (
    <div className="space-y-6">
      {/* Lifetime Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-gray-900">
              &pound;{lifetimeDonationTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-gray-500 mt-1">Lifetime Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-gray-900">{contact.donations.length}</p>
            <p className="text-sm text-gray-500 mt-1">Total Donations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-gray-900">
              &pound;{contact.donations.length > 0
                ? (lifetimeDonationTotal / contact.donations.length).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "0.00"}
            </p>
            <p className="text-sm text-gray-500 mt-1">Average Donation</p>
          </CardContent>
        </Card>
      </div>

      {/* Donations Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">All Donations</h3>
            <span className="text-sm text-gray-500">{contact.donations.length} total</span>
          </div>
        </CardHeader>
        <CardContent>
          {contact.donations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No donations recorded for this contact.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Type</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">Amount</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Method</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Campaign / Event</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Gift Aid</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contact.donations.map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-2">
                        <Link href={`/finance/donations/${d.id}`} className="text-indigo-600 hover:underline">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                            <span>{formatDate(d.date)}</span>
                          </div>
                          <span className="text-xs text-gray-400 ml-5">
                            {new Date(d.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant="outline" className="text-xs">
                          {d.isRetail ? "Retail" : d.type}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right font-semibold text-gray-900">
                        &pound;{Number(d.amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-2 text-gray-600">{d.method || "—"}</td>
                      <td className="py-3 px-2">
                        <div className="flex flex-col gap-0.5">
                          {d.campaign && (
                            <div className="flex items-center gap-1 text-xs text-indigo-600">
                              <Tag className="h-3 w-3" />
                              {d.campaign.name}
                            </div>
                          )}
                          {d.event && (
                            <Link href={`/events/${d.event.id}`} className="flex items-center gap-1 text-xs text-purple-600 hover:underline">
                              <Calendar className="h-3 w-3" />
                              {d.event.name}
                            </Link>
                          )}
                          {!d.campaign && !d.event && <span className="text-gray-400">{"—"}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        {d.isGiftAidable ? (
                          <Badge className={d.giftAidClaimed ? "bg-green-100 text-green-800 text-xs" : "bg-amber-100 text-amber-800 text-xs"}>
                            {d.giftAidClaimed ? "Claimed" : "Eligible"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <Badge className={
                          d.status === "RECEIVED" ? "bg-green-100 text-green-800 text-xs" :
                          d.status === "PENDING" ? "bg-yellow-100 text-yellow-800 text-xs" :
                          d.status === "REFUNDED" ? "bg-red-100 text-red-800 text-xs" :
                          "bg-gray-100 text-gray-800 text-xs"
                        }>{d.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Soft Credits */}
      {contact.softCredits.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Soft Credits</h3>
              </div>
              <span className="text-sm text-gray-500">{contact.softCredits.length} total</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500 mb-3">Donations where this contact received soft credit</p>
            <div className="space-y-2">
              {contact.softCredits.map((sc: any) => (
                <Link
                  key={sc.id}
                  href={`/finance/donations/${sc.donation.id}`}
                  className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-lg -mx-1"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Donation by {sc.donation.contact.firstName} {sc.donation.contact.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(sc.donation.date)}
                      {sc.notes && <span className="ml-2 text-gray-400">{sc.notes}</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    &pound;{Number(sc.amount).toFixed(2)}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const activityContent = (
    <div className="space-y-6">
      {/* Interactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Interactions</h3>
            <span className="text-sm text-gray-500">{contact.interactions.length} total</span>
          </div>
        </CardHeader>
        <CardContent>
          <form action={addInteraction} className="space-y-3 mb-6 pb-6 border-b border-gray-100">
            <div className="grid grid-cols-2 gap-3">
              <select name="type" required className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="EMAIL">Email</option>
                <option value="CALL">Call</option>
                <option value="MEETING">Meeting</option>
                <option value="LETTER">Letter</option>
                <option value="EVENT">Event</option>
                <option value="TASK">Task</option>
                <option value="DONATION">Donation</option>
                <option value="OTHER">Other</option>
              </select>
              <Input name="subject" placeholder="Subject" required />
            </div>
            <Input name="description" placeholder="Description (optional)" />
            <Button type="submit" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Log Interaction
            </Button>
          </form>
          <div className="space-y-3">
            {contact.interactions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No interactions yet. Log your first one above.</p>
            ) : (
              contact.interactions.map((interaction) => (
                <div key={interaction.id} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                  <span className="text-lg mt-0.5">{interactionIcons[interaction.type] || "\u{1F4CB}"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{interaction.subject}</p>
                      <Badge variant="outline" className="text-xs">{interaction.type}</Badge>
                    </div>
                    {interaction.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{interaction.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(interaction.date)} {"•"} {interaction.createdBy.name}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
            <span className="text-sm text-gray-500">{contact.notes.length} total</span>
          </div>
        </CardHeader>
        <CardContent>
          <form action={addNote} className="space-y-3 mb-6 pb-6 border-b border-gray-100">
            <Textarea name="content" placeholder="Add a note..." required />
            <Button type="submit" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Note
            </Button>
          </form>
          <div className="space-y-3">
            {contact.notes.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No notes yet. Add your first one above.</p>
            ) : (
              contact.notes.map((note) => (
                <div key={note.id} className="py-3 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(note.createdAt)} {"•"} {note.createdBy.name}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/crm/contacts" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Contact Details</h1>
      </div>

      {/* Profile Card -- always visible above tabs */}
      <Card className={isGoldDonor ? "border-2 border-amber-400 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 shadow-lg ring-1 ring-amber-200" : ""}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar firstName={contact.firstName} lastName={contact.lastName} size="lg" />
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  {/* Name + Donor ID */}
                  <h2 className="text-xl font-bold text-gray-900">
                    {contact.firstName} {contact.lastName}
                  </h2>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">Donor ID: {String(contact.donorId).padStart(5, "0")}</p>

                  {/* Status badges */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {contact.types.map((t) => (
                      <span key={t} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${typeColors[t] || "bg-gray-100 text-gray-800"}`}>
                        {t}
                      </span>
                    ))}
                    {contact.giftAids.some((ga) => ga.type === "STANDARD" && ga.status === "ACTIVE") && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-pink-100 text-pink-800 px-2 py-1 text-xs font-semibold">
                        <Heart className="h-3 w-3" />
                        Gift Aid
                      </span>
                    )}
                    {contact.giftAids.some((ga) => ga.type === "RETAIL" && ga.status === "ACTIVE") && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 text-purple-800 px-2 py-1 text-xs font-semibold">
                        <Package className="h-3 w-3" />
                        Retail Gift Aid
                      </span>
                    )}
                    {contact.isLotteryMember && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-800 px-2 py-1 text-xs font-semibold">
                        <Ticket className="h-3 w-3" />
                        Lottery
                      </span>
                    )}
                    {isGoldDonor && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 text-white px-2 py-1 text-xs font-semibold shadow-sm">
                        <Crown className="h-3 w-3" />
                        Gold Donor
                      </span>
                    )}
                    {contact.isArchived && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-800 px-2 py-1 text-xs font-semibold">
                        Archived
                      </span>
                    )}
                  </div>

                  {/* Quick links */}
                  {!contact.volunteerProfile && contact.types.includes("VOLUNTEER") && (
                    <div className="flex gap-2 mt-2">
                      <form action={createVolunteerProfile}>
                        <button type="submit" className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
                          <Plus className="h-3 w-3" /> Create Volunteer Profile
                        </button>
                      </form>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <form action={toggleArchive}>
                    <Button type="submit" variant="outline" size="sm" className="gap-2">
                      {contact.isArchived ? (
                        <><ArchiveX className="h-4 w-4" /> Unarchive</>
                      ) : (
                        <><Archive className="h-4 w-4" /> Archive</>
                      )}
                    </Button>
                  </form>
                  <form action={deleteContact}>
                    <ConfirmButton message="Are you sure you want to delete this contact? This action cannot be undone." variant="destructive" size="sm" className="gap-2">
                      <Trash2 className="h-4 w-4" /> Delete
                    </ConfirmButton>
                  </form>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4" /> {contact.email}
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" /> {contact.phone}
                  </div>
                )}
                {contact.addressLine1 && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4" />
                    {[contact.addressLine1, contact.city, contact.postcode].filter(Boolean).join(", ")}
                  </div>
                )}
                {contact.organisation && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Building2 className="h-4 w-4" />
                    <Link href={`/crm/organisations/${contact.organisationId}`} className="text-indigo-600 hover:underline">
                      {contact.organisation.name}
                    </Link>
                  </div>
                )}
                {contact.dateOfBirth && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    {"\u{1F382}"} Born: {contact.dateOfBirth}
                  </div>
                )}
              </div>
              {lifetimeDonationTotal > 0 && (
                <div className="flex items-center gap-2 mt-3 p-2 bg-green-50 rounded-lg">
                  <PoundSterling className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">
                    Lifetime Donations: &pound;{lifetimeDonationTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs text-green-600">({contact.donations.length} donation{contact.donations.length !== 1 ? "s" : ""})</span>
                </div>
              )}
              {contact.tags.length > 0 && (
                <div className="flex gap-1 mt-3 flex-wrap">
                  {contact.tags.map((ct) => (
                    <Badge key={ct.tagId} variant="outline">{ct.tag.name}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabbed content */}
      <ContactTabs
        overviewContent={overviewContent}
        activityContent={activityContent}
        donationsContent={donationsContent}
        interactionCount={contact.interactions.length}
        noteCount={contact.notes.length}
        donationCount={contact.donations.length}
        isVolunteer={!!contact.volunteerProfile}
        trainingCount={contact.volunteerProfile?.trainings.length ?? 0}
        hoursCount={contact.volunteerProfile?.hoursLogs.length ?? 0}
        volunteerContent={contact.volunteerProfile ? (
          <div className="space-y-6">
            {/* Volunteer Info & Why */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Volunteer Details</h3>
              </CardHeader>
              <CardContent>
                <form action={updateVolunteerProfile} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select name="volunteerStatus" defaultValue={contact.volunteerProfile.status} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                        <option value="APPLICANT">Applicant</option>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="ON_LEAVE">On Leave</option>
                        <option value="DEPARTED">Departed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                      <Input name="startDate" type="date" defaultValue={contact.volunteerProfile.startDate || ""} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Desired Hours / Week</label>
                      <Input name="desiredHoursPerWeek" type="number" step="0.5" defaultValue={contact.volunteerProfile.desiredHoursPerWeek ?? ""} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Why do you volunteer? <span className="text-gray-400 font-normal">(Their personal motivation)</span></label>
                    <Textarea name="motivation" rows={3} defaultValue={contact.volunteerProfile.motivation || ""} placeholder="e.g. My father was cared for by the hospice and I want to give back..." />
                  </div>
                  <Button type="submit">Update Volunteer Profile</Button>
                </form>
              </CardContent>
            </Card>

            {/* Recent Assignments */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Recent Assignments</h3>
                </div>
              </CardHeader>
              <CardContent>
                {contact.volunteerProfile.assignments.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No assignments yet.</p>
                ) : (
                  <div className="space-y-2">
                    {contact.volunteerProfile.assignments.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-gray-900 truncate">{a.title}</span>
                          {a.department && <Badge variant="outline" className="text-xs shrink-0">{a.department.name}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-500">{formatDate(a.date)}</span>
                          <Badge className={
                            a.status === "COMPLETED" ? "bg-green-100 text-green-800 text-xs" :
                            a.status === "CONFIRMED" ? "bg-blue-100 text-blue-800 text-xs" :
                            a.status === "CANCELLED" ? "bg-red-100 text-red-800 text-xs" :
                            "bg-gray-100 text-gray-800 text-xs"
                          }>{a.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : undefined}
        trainingContent={contact.volunteerProfile ? (
          <div className="space-y-6">
            {/* Enrol in a new course */}
            {availableCourses.length > 0 && (
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold text-gray-900">Enrol in Course</h3>
                </CardHeader>
                <CardContent>
                  <form action={enrolTraining} className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Training Course</label>
                      <select name="courseId" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                        <option value="">Select a course...</option>
                        {availableCourses.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit">Enrol</Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Enrolled courses table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Training Courses</h3>
                  <span className="text-sm text-gray-500">{contact.volunteerProfile.trainings.length} course{contact.volunteerProfile.trainings.length !== 1 ? "s" : ""}</span>
                </div>
              </CardHeader>
              <CardContent>
                {contact.volunteerProfile.trainings.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No training courses assigned.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Course</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Enrolled</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Completed</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Expires</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Renewal</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contact.volunteerProfile.trainings.map((t: any) => {
                          // RAG status calculation
                          let ragColor = "";
                          let ragLabel = "";
                          if (t.expiryDate && t.status === "COMPLETED") {
                            const now = new Date();
                            const expiry = new Date(t.expiryDate);
                            const monthsLeft = (expiry.getFullYear() - now.getFullYear()) * 12 + (expiry.getMonth() - now.getMonth());
                            const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                            const red = t.course.redMonths ?? 1;
                            const amber = t.course.amberMonths ?? 3;
                            if (daysLeft <= 0) {
                              ragColor = "bg-red-500"; ragLabel = "Overdue";
                            } else if (monthsLeft <= red) {
                              ragColor = "bg-red-500"; ragLabel = `${daysLeft}d left`;
                            } else if (monthsLeft <= amber) {
                              ragColor = "bg-amber-400"; ragLabel = `${daysLeft}d left`;
                            } else {
                              ragColor = "bg-green-500"; ragLabel = `${daysLeft}d left`;
                            }
                          }
                          return (
                          <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3 px-2 font-medium text-gray-900">
                              {t.course.name}
                              {t.course.isMandatory && <Badge className="ml-2 bg-red-50 text-red-700 text-xs">Mandatory</Badge>}
                            </td>
                            <td className="py-3 px-2">
                              <Badge className={
                                t.status === "COMPLETED" ? "bg-green-100 text-green-800 text-xs" :
                                t.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-800 text-xs" :
                                t.status === "NOT_STARTED" ? "bg-gray-100 text-gray-800 text-xs" :
                                t.status === "EXPIRED" ? "bg-red-100 text-red-800 text-xs" :
                                "bg-gray-100 text-gray-800 text-xs"
                              }>{t.status}</Badge>
                            </td>
                            <td className="py-3 px-2 text-gray-500">{t.createdAt ? formatDate(t.createdAt) : "—"}</td>
                            <td className="py-3 px-2 text-gray-500">{t.completedDate ? formatDate(t.completedDate) : "—"}</td>
                            <td className="py-3 px-2 text-gray-500">{t.expiryDate ? formatDate(t.expiryDate) : "—"}</td>
                            <td className="py-3 px-2">
                              {ragLabel ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
                                  <span className={`h-2.5 w-2.5 rounded-full ${ragColor}`} />
                                  {ragLabel}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {t.status === "NOT_STARTED" && (
                                  <form action={updateTrainingStatus}>
                                    <input type="hidden" name="trainingId" value={t.id} />
                                    <input type="hidden" name="status" value="IN_PROGRESS" />
                                    <Button type="submit" variant="outline" className="text-xs h-7 px-2">Start</Button>
                                  </form>
                                )}
                                {t.status === "IN_PROGRESS" && (
                                  <form action={updateTrainingStatus}>
                                    <input type="hidden" name="trainingId" value={t.id} />
                                    <input type="hidden" name="status" value="COMPLETED" />
                                    <Button type="submit" variant="outline" className="text-xs h-7 px-2 text-green-700 border-green-300 hover:bg-green-50">Complete</Button>
                                  </form>
                                )}
                                {t.status === "EXPIRED" && (
                                  <form action={updateTrainingStatus}>
                                    <input type="hidden" name="trainingId" value={t.id} />
                                    <input type="hidden" name="status" value="NOT_STARTED" />
                                    <Button type="submit" variant="outline" className="text-xs h-7 px-2">Re-enrol</Button>
                                  </form>
                                )}
                                <form action={removeTraining}>
                                  <input type="hidden" name="trainingId" value={t.id} />
                                  <Button type="submit" variant="outline" className="text-xs h-7 px-2 text-red-600 border-red-200 hover:bg-red-50">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </form>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : undefined}
        hoursContent={contact.volunteerProfile ? (
          <div className="space-y-6">
            {/* Total summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {contact.volunteerProfile.hoursLogs.reduce((sum: number, log: any) => sum + Number(log.hours), 0).toFixed(1)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Total Hours</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-gray-900">{contact.volunteerProfile.hoursLogs.length}</p>
                  <p className="text-sm text-gray-500 mt-1">Log Entries</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {contact.volunteerProfile.hoursLogs.length > 0
                      ? (contact.volunteerProfile.hoursLogs.reduce((sum: number, log: any) => sum + Number(log.hours), 0) / contact.volunteerProfile.hoursLogs.length).toFixed(1)
                      : "0"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Avg Hours / Entry</p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Hours Log</h3>
              </CardHeader>
              <CardContent>
                {contact.volunteerProfile.hoursLogs.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No hours logged yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                          <th className="text-right py-3 px-2 font-medium text-gray-500">Hours</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contact.volunteerProfile.hoursLogs.map((log: any) => (
                          <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3 px-2 text-gray-900">{formatDate(log.date)}</td>
                            <td className="py-3 px-2 text-right font-semibold text-gray-900">{Number(log.hours).toFixed(1)}</td>
                            <td className="py-3 px-2 text-gray-600">{log.description || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : undefined}
        skillsDeptContent={contact.volunteerProfile ? (
          <div className="space-y-6">
            {/* Departments */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Departments</h3>
                </div>
              </CardHeader>
              <CardContent>
                {contact.volunteerProfile.departments.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Not assigned to any departments.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {contact.volunteerProfile.departments.map((vd: any) => (
                      <Badge key={vd.department.id} className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 text-sm">
                        {vd.department.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Skills */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Skills</h3>
                </div>
              </CardHeader>
              <CardContent>
                {contact.volunteerProfile.skills.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No skills assigned.</p>
                ) : (
                  <div className="space-y-2">
                    {contact.volunteerProfile.skills.map((vs: any) => (
                      <div key={vs.skill.id} className="flex items-center justify-between py-2 px-3 bg-purple-50 rounded-lg">
                        <span className="text-sm font-medium text-gray-900">{vs.skill.name}</span>
                        {vs.proficiency && <Badge variant="outline" className="text-xs">{vs.proficiency}</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : undefined}
        complianceContent={contact.volunteerProfile ? (
          <div className="space-y-6">
            {/* DBS Checks */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">DBS Checks</h3>
                </div>
              </CardHeader>
              <CardContent>
                {contact.volunteerProfile.dbsChecks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No DBS checks on record.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Check Date</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Level</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Certificate</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-500">Expiry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contact.volunteerProfile.dbsChecks.map((dbs: any) => (
                          <tr key={dbs.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3 px-2 text-gray-900">{formatDate(dbs.checkDate)}</td>
                            <td className="py-3 px-2"><Badge variant="outline" className="text-xs">{dbs.level}</Badge></td>
                            <td className="py-3 px-2">
                              <Badge className={
                                dbs.status === "CLEARED" ? "bg-green-100 text-green-800 text-xs" :
                                dbs.status === "PENDING" ? "bg-yellow-100 text-yellow-800 text-xs" :
                                dbs.status === "EXPIRED" ? "bg-red-100 text-red-800 text-xs" :
                                "bg-gray-100 text-gray-800 text-xs"
                              }>{dbs.status}</Badge>
                            </td>
                            <td className="py-3 px-2 font-mono text-xs text-gray-500">{dbs.certificateNumber || "—"}</td>
                            <td className="py-3 px-2 text-gray-500">{dbs.expiryDate ? formatDate(dbs.expiryDate) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Driving Licence */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Driving Licence</h3>
              </CardHeader>
              <CardContent>
                {!contact.volunteerProfile.drivingLicence ? (
                  <p className="text-sm text-gray-500 text-center py-4">No driving licence on file.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Licence Number</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">{contact.volunteerProfile.drivingLicence.licenceNumber || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Expiry Date</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {contact.volunteerProfile.drivingLicence.expiryDate ? formatDate(contact.volunteerProfile.drivingLicence.expiryDate) : "—"}
                        {contact.volunteerProfile.drivingLicence.expiryDate && new Date(contact.volunteerProfile.drivingLicence.expiryDate) < new Date() && (
                          <Badge className="ml-2 bg-red-100 text-red-800 text-xs">Expired</Badge>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Categories</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">{contact.volunteerProfile.drivingLicence.categories || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Verified</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {contact.volunteerProfile.drivingLicence.verifiedAt
                          ? formatDate(contact.volunteerProfile.drivingLicence.verifiedAt)
                          : <Badge className="bg-yellow-100 text-yellow-800 text-xs">Not Verified</Badge>}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Onboarding Steps */}
            {contact.volunteerProfile.onboardingSteps.length > 0 && (
              <Card>
                <CardHeader>
                  <h3 className="text-lg font-semibold text-gray-900">Onboarding Progress</h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {contact.volunteerProfile.onboardingSteps.map((step: any) => (
                      <div key={step.id} className="flex items-center gap-3 py-2">
                        <div className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold ${step.completedAt ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                          {step.completedAt ? "✓" : "○"}
                        </div>
                        <span className={`text-sm ${step.completedAt ? "text-gray-900" : "text-gray-500"}`}>{step.stepName.replace(/_/g, " ")}</span>
                        {step.completedAt && <span className="text-xs text-gray-400 ml-auto">{formatDate(step.completedAt)}</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : undefined}
      />
    </div>
  );
}
