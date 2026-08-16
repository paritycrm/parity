import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { sendEmail } from "@/lib/email";
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
import { getGrantSteps } from "@/components/ui/pipeline-steps";
import { GrantTabs } from "./components/grant-tabs";
import { GrantDocuments } from "./components/grant-documents";
import { GrantComments } from "./components/grant-comments";
import { GrantRequirements } from "./components/grant-requirements";
import { GrantRestrictions } from "./components/grant-restrictions";
import { GrantInstalments } from "./components/grant-instalments";
import { FunderSelect } from "@/components/ui/funder-select";

export default async function GrantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();

  const grant = await prisma.grant.findUnique({
    where: { id },
    include: {
      createdBy: true,
      funder: true,
      documents: { orderBy: { createdAt: "desc" } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true } },
          mentions: { include: { user: { select: { id: true, name: true } } } },
          attachments: { select: { id: true, fileName: true, fileSize: true } },
        },
      },
      requirements: {
        orderBy: { dueDate: "asc" },
        include: {
          attachments: { select: { id: true, fileName: true, fileSize: true } },
        },
      },
      restrictions: {
        orderBy: { createdAt: "asc" },
        include: { evidence: { orderBy: { createdAt: "asc" } } },
      },
      instalments: { orderBy: { expectedDate: "asc" } },
    },
  });

  if (!grant) notFound();

  const [teamMembers, funderOrgs] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "STAFF"] } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.organisation.findMany({
      where: { roleAssignments: { some: { role: { name: "Funder" } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // ─── Server Actions ───

  async function updateGrantStatus(formData: FormData) {
    "use server";
    const s = await requireAuth();
    const currentGrant = await prisma.grant.findUnique({ where: { id } });
    if (!currentGrant) return;

    const status = formData.get("status") as string;
    const updateData: any = { status };
    if (status === "SUBMITTED" && !currentGrant.submittedDate) updateData.submittedDate = new Date();
    if ((status === "SUCCESSFUL" || status === "UNSUCCESSFUL") && !currentGrant.decisionDate) updateData.decisionDate = new Date();
    if (status === "REPORTING" && !currentGrant.startDate) updateData.startDate = new Date();

    await prisma.grant.update({ where: { id }, data: updateData });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function updateGrantDetails(formData: FormData) {
    "use server";
    const s = await requireAuth();
    const parse = (key: string) => (formData.get(key) as string) || null;
    const parseFloat_ = (key: string) => {
      const v = formData.get(key) as string;
      return v ? parseFloat(v) : null;
    };
    const parseDate = (key: string) => {
      const v = formData.get(key) as string;
      return v ? new Date(v) : null;
    };

    const funderIdVal = (formData.get("funderId") as string) || null;
    await prisma.grant.update({
      where: { id },
      data: {
        title: formData.get("title") as string,
        funderName: formData.get("funderName") as string,
        funderId: funderIdVal,
        type: formData.get("type") as string,
        description: parse("description"),
        purpose: parse("purpose"),
        conditions: parse("conditions"),
        contactPerson: parse("contactPerson"),
        contactEmail: parse("contactEmail"),
        reference: parse("reference"),
        notes: parse("notes"),
        amountRequested: parseFloat_("amountRequested"),
        amountAwarded: parseFloat_("amountAwarded"),
        applicationDeadline: parseDate("applicationDeadline"),
        startDate: parseDate("startDate"),
        endDate: parseDate("endDate"),
        reportingDeadline: parseDate("reportingDeadline"),
        isAnonymous: formData.get("isAnonymous") === "true",
        allowsPublicity: formData.get("allowsPublicity") === "true",
        funderLogoSpec: parse("funderLogoSpec"),
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function deleteGrant() {
    "use server";
    await requireAuth();
    await prisma.grant.delete({ where: { id } });
    revalidatePath("/finance/grants");
    redirect("/finance/grants");
  }

  // ─── Document Actions ───

  async function uploadDocument(formData: FormData) {
    "use server";
    const s = await requireAuth();
    await prisma.grantDocument.create({
      data: {
        grantId: formData.get("grantId") as string,
        fileName: formData.get("fileName") as string,
        fileType: formData.get("fileType") as string,
        fileSize: parseInt(formData.get("fileSize") as string),
        fileData: formData.get("fileData") as string,
        uploadedById: s.id,
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function deleteDocument(formData: FormData) {
    "use server";
    await requireAuth();
    await prisma.grantDocument.delete({
      where: { id: formData.get("documentId") as string },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  // ─── Comment Actions ───

  async function addComment(formData: FormData) {
    "use server";
    const s = await requireAuth();
    const content = formData.get("content") as string;
    const mentionIdsRaw = formData.get("mentionIds") as string;
    const mentionIds: string[] = mentionIdsRaw ? JSON.parse(mentionIdsRaw) : [];

    const comment = await prisma.grantComment.create({
      data: {
        grantId: formData.get("grantId") as string,
        authorId: s.id,
        content,
        mentions: {
          create: mentionIds.map((userId) => ({ userId })),
        },
      },
    });

    // Create notifications + email for mentions
    const currentGrant = await prisma.grant.findUnique({
      where: { id },
      select: { title: true },
    });

    for (const userId of mentionIds) {
      await prisma.notification.create({
        data: {
          recipientId: userId,
          type: "GRANT_MENTION",
          title: `Mentioned in grant: ${currentGrant?.title || ""}`,
          body: content.slice(0, 200),
          link: `/finance/grants/${id}`,
          channel: "IN_APP",
          status: "SENT",
          sentAt: new Date(),
        },
      });

      // Send email alert
      const mentionedUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (mentionedUser?.email) {
        try {
          await sendEmail({
            to: mentionedUser.email,
            subject: `You were mentioned in grant: ${currentGrant?.title || ""}`,
            html: `<p><strong>${s.name}</strong> mentioned you in a grant note:</p><blockquote>${content}</blockquote><p><a href="${process.env.NEXT_PUBLIC_APP_URL || ""}/finance/grants/${id}">View Grant</a></p>`,
          });
        } catch (e) {
          // Email send failure shouldn't block the comment
        }
      }
    }

    revalidatePath(`/finance/grants/${id}`);
  }

  async function sendGrantEmail(formData: FormData) {
    "use server";
    const s = await requireAuth();
    const content = formData.get("content") as string;
    const emailSubject = (formData.get("emailSubject") as string) || "Grant Correspondence";

    const currentGrant = await prisma.grant.findUnique({
      where: { id },
      select: { contactEmail: true, contactPerson: true, title: true },
    });
    if (!currentGrant?.contactEmail) return;

    // Save as comment
    await prisma.grantComment.create({
      data: {
        grantId: formData.get("grantId") as string,
        authorId: s.id,
        content,
        isEmail: true,
        emailTo: currentGrant.contactEmail,
        emailSubject,
      },
    });

    // Send actual email
    try {
      await sendEmail({
        to: currentGrant.contactEmail,
        subject: emailSubject,
        html: `<div style="white-space:pre-wrap">${content}</div>`,
      });
    } catch (e) {
      // Logged but not blocking
    }

    revalidatePath(`/finance/grants/${id}`);
  }

  async function deleteComment(formData: FormData) {
    "use server";
    await requireAuth();
    const commentId = formData.get("commentId") as string;
    await prisma.grantCommentMention.deleteMany({ where: { commentId } });
    await prisma.grantComment.delete({ where: { id: commentId } });
    revalidatePath(`/finance/grants/${id}`);
  }

  // ─── Requirement Actions ───

  async function addRequirement(formData: FormData) {
    "use server";
    const s = await requireAuth();
    await prisma.grantReportingRequirement.create({
      data: {
        grantId: formData.get("grantId") as string,
        title: formData.get("title") as string,
        description: (formData.get("description") as string) || null,
        dueDate: new Date(formData.get("dueDate") as string),
        createdById: s.id,
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function updateRequirementStatus(formData: FormData) {
    "use server";
    await requireAuth();
    const status = formData.get("status") as string;
    await prisma.grantReportingRequirement.update({
      where: { id: formData.get("requirementId") as string },
      data: {
        status,
        completedAt: status === "COMPLETE" ? new Date() : null,
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function deleteRequirement(formData: FormData) {
    "use server";
    await requireAuth();
    await prisma.grantReportingRequirement.delete({
      where: { id: formData.get("requirementId") as string },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function uploadRequirementAttachment(formData: FormData) {
    "use server";
    const s = await requireAuth();
    await prisma.grantRequirementAttachment.create({
      data: {
        requirementId: formData.get("requirementId") as string,
        fileName: formData.get("fileName") as string,
        fileType: formData.get("fileType") as string,
        fileSize: parseInt(formData.get("fileSize") as string),
        fileData: formData.get("fileData") as string,
        uploadedById: s.id,
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  // ─── Restriction Actions ───

  async function addRestriction(formData: FormData) {
    "use server";
    await requireAuth();
    const amount = formData.get("amount") as string;
    await prisma.grantRestriction.create({
      data: {
        grantId: formData.get("grantId") as string,
        description: formData.get("description") as string,
        amount: amount ? parseFloat(amount) : null,
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function deleteRestriction(formData: FormData) {
    "use server";
    await requireAuth();
    await prisma.grantRestriction.delete({
      where: { id: formData.get("restrictionId") as string },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function addEvidence(formData: FormData) {
    "use server";
    const s = await requireAuth();
    const amount = formData.get("amount") as string;
    await prisma.grantRestrictionEvidence.create({
      data: {
        restrictionId: formData.get("restrictionId") as string,
        description: formData.get("description") as string,
        amount: amount ? parseFloat(amount) : null,
        fileName: (formData.get("fileName") as string) || null,
        fileType: (formData.get("fileType") as string) || null,
        fileData: (formData.get("fileData") as string) || null,
        uploadedById: s.id,
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  // ─── Instalment Actions ───

  async function toggleSplit(formData: FormData) {
    "use server";
    await requireAuth();
    await prisma.grant.update({
      where: { id: formData.get("grantId") as string },
      data: {
        isSplitPayment: formData.get("isSplitPayment") === "true",
        splitPeriodType: (formData.get("splitPeriodType") as string) || null,
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function addInstalment(formData: FormData) {
    "use server";
    await requireAuth();
    await prisma.grantInstalment.create({
      data: {
        grantId: formData.get("grantId") as string,
        periodLabel: formData.get("periodLabel") as string,
        amount: parseFloat(formData.get("amount") as string),
        expectedDate: new Date(formData.get("expectedDate") as string),
      },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function markReceived(formData: FormData) {
    "use server";
    await requireAuth();
    await prisma.grantInstalment.update({
      where: { id: formData.get("instalmentId") as string },
      data: { received: true, receivedDate: new Date() },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  async function deleteInstalment(formData: FormData) {
    "use server";
    await requireAuth();
    await prisma.grantInstalment.delete({
      where: { id: formData.get("instalmentId") as string },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  // ─── Logo Upload ───

  async function uploadFunderLogo(formData: FormData) {
    "use server";
    await requireAuth();
    await prisma.grant.update({
      where: { id },
      data: { funderLogoUrl: formData.get("logoData") as string },
    });
    revalidatePath(`/finance/grants/${id}`);
  }

  // ─── Render Helpers ───

  const statusColors: Record<string, string> = {
    IDENTIFIED: "bg-blue-100 text-blue-800",
    RESEARCHING: "bg-blue-100 text-blue-800",
    APPLYING: "bg-yellow-100 text-yellow-800",
    SUBMITTED: "bg-yellow-100 text-yellow-800",
    SUCCESSFUL: "bg-purple-100 text-purple-800",
    UNSUCCESSFUL: "bg-red-100 text-red-800",
    REPORTING: "bg-green-100 text-green-800",
    COMPLETED: "bg-gray-100 text-gray-800",
  };

  const typeOptions = [
    { value: "TRUST", label: "Trust" },
    { value: "FOUNDATION", label: "Foundation" },
    { value: "GOVERNMENT", label: "Government" },
    { value: "CORPORATE", label: "Corporate" },
    { value: "LOTTERY", label: "Lottery" },
    { value: "OTHER", label: "Other" },
  ];

  const statusOptions = [
    { value: "IDENTIFIED", label: "Identified" },
    { value: "RESEARCHING", label: "Researching" },
    { value: "APPLYING", label: "Applying" },
    { value: "SUBMITTED", label: "Submitted" },
    { value: "SUCCESSFUL", label: "Successful" },
    { value: "UNSUCCESSFUL", label: "Unsuccessful" },
    { value: "REPORTING", label: "Reporting" },
    { value: "COMPLETED", label: "Completed" },
  ];

  const dateVal = (d: Date | null) => (d ? d.toISOString().split("T")[0] : "");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/finance/grants" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{grant.title}</h1>
            <p className="text-sm text-gray-500">
              {grant.funderId ? (
                <Link
                  href="/crm/organisations"
                  className="text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  {grant.funderName}
                </Link>
              ) : (
                grant.funderName
              )} · <Badge className={statusColors[grant.status]}>{grant.status}</Badge>
              {grant.isAnonymous && (
                <Badge className="ml-2 bg-amber-100 text-amber-800">Anonymous Funder</Badge>
              )}
            </p>
          </div>
        </div>
        <form action={deleteGrant}>
          <ConfirmButton message="Are you sure you want to delete this grant and all associated data?" variant="destructive" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ConfirmButton>
        </form>
      </div>

      {/* Pipeline */}
      <Card>
        <CardContent className="pt-6">
          <PipelineTimeline
            steps={getGrantSteps(grant)}
            currentStepKey={grant.status === "UNSUCCESSFUL" ? "SUBMITTED" : grant.status}
            variant="grant"
            size="full"
          />
          {grant.status === "UNSUCCESSFUL" && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-center">
              <p className="text-sm text-red-700 font-medium">This grant application was unsuccessful</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabbed Content */}
      <Card>
        <CardContent className="pt-6">
          <GrantTabs
            counts={{
              documents: grant.documents.length,
              correspondence: grant.comments.length,
              requirements: grant.requirements.length,
              restrictions: grant.restrictions.length,
              payments: grant.instalments.length,
            }}
          >
            {{
              overview: (
                <div className="space-y-8">
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase">Awarded</p>
                        <p className="text-xl font-bold text-gray-900 mt-1">
                          {grant.amountAwarded
                            ? `£${Number(grant.amountAwarded).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase">Requested</p>
                        <p className="text-sm text-gray-900 mt-1">
                          {grant.amountRequested
                            ? `£${Number(grant.amountRequested).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase">Contact</p>
                        <p className="text-sm text-gray-900 mt-1">
                          {grant.contactPerson || "—"}
                          {grant.contactEmail && (
                            <span className="text-gray-500 ml-1">({grant.contactEmail})</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase">Type</p>
                        <p className="text-sm text-gray-900 mt-1">{grant.type}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase">Reference</p>
                        <p className="text-sm text-gray-900 mt-1">{grant.reference || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase">Publicity</p>
                        <p className="text-sm text-gray-900 mt-1">
                          {grant.allowsPublicity ? "Allowed" : "Not allowed"}
                          {grant.funderLogoUrl && " · Logo on file"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {grant.description && (
                    <div className="pt-6 border-t">
                      <p className="text-xs font-medium text-gray-500 uppercase">Description</p>
                      <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{grant.description}</p>
                    </div>
                  )}

                  {/* Update Status */}
                  <div className="pt-6 border-t">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Update Status</h3>
                    <form action={updateGrantStatus} className="flex items-end gap-3">
                      <Select label="" name="status" required defaultValue={grant.status} options={statusOptions} />
                      <Button type="submit" size="sm">Update</Button>
                    </form>
                  </div>

                  {/* Edit Details */}
                  <div className="pt-6 border-t">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">Edit Details</h3>
                    <form action={updateGrantDetails} className="space-y-4">
                      <Input label="Title" name="title" required defaultValue={grant.title} />
                      <FunderSelect
                        funderOrgs={funderOrgs}
                        defaultFunderId={grant.funderId}
                        defaultFunderName={grant.funderName}
                        required
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <Select label="Type" name="type" required defaultValue={grant.type} options={typeOptions} />
                        <Input label="Reference" name="reference" defaultValue={grant.reference || ""} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Input label="Amount Requested" name="amountRequested" type="number" step="0.01" defaultValue={grant.amountRequested ? Number(grant.amountRequested) : ""} />
                        <Input label="Amount Awarded" name="amountAwarded" type="number" step="0.01" defaultValue={grant.amountAwarded ? Number(grant.amountAwarded) : ""} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Input label="Application Deadline" name="applicationDeadline" type="date" defaultValue={dateVal(grant.applicationDeadline)} />
                        <Input label="Reporting Deadline" name="reportingDeadline" type="date" defaultValue={dateVal(grant.reportingDeadline)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Input label="Start Date" name="startDate" type="date" defaultValue={dateVal(grant.startDate)} />
                        <Input label="End Date" name="endDate" type="date" defaultValue={dateVal(grant.endDate)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Input label="Contact Person" name="contactPerson" defaultValue={grant.contactPerson || ""} />
                        <Input label="Contact Email" name="contactEmail" type="email" defaultValue={grant.contactEmail || ""} />
                      </div>
                      <Input label="Description" name="description" defaultValue={grant.description || ""} />
                      <Input label="Purpose" name="purpose" defaultValue={grant.purpose || ""} />
                      <Input label="Conditions" name="conditions" defaultValue={grant.conditions || ""} />
                      <Input label="Notes" name="notes" defaultValue={grant.notes || ""} />

                      {/* Flags */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Anonymous Funder</label>
                          <select name="isAnonymous" defaultValue={grant.isAnonymous ? "true" : "false"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                            <option value="false">No — publicity is allowed</option>
                            <option value="true">Yes — funder wishes to remain anonymous</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Allows Publicity</label>
                          <select name="allowsPublicity" defaultValue={grant.allowsPublicity ? "true" : "false"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                            <option value="false">No</option>
                            <option value="true">Yes — we can publicise this grant</option>
                          </select>
                        </div>
                      </div>

                      <Input
                        label="Logo Spec (required format)"
                        name="funderLogoSpec"
                        placeholder="e.g. 1200x600 JPEG"
                        defaultValue={grant.funderLogoSpec || ""}
                      />

                      <Button type="submit">
                        <Edit2 className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                    </form>
                  </div>

                  {/* Funder Logo */}
                  {grant.allowsPublicity && (
                    <div className="pt-6 border-t">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">
                        Funder Logo
                        {grant.funderLogoSpec && (
                          <span className="text-xs text-gray-400 ml-2 font-normal">
                            Required: {grant.funderLogoSpec}
                          </span>
                        )}
                      </h3>
                      {grant.funderLogoUrl && (
                        <div className="mb-3">
                          <img
                            src={grant.funderLogoUrl}
                            alt="Funder logo"
                            className="max-h-24 rounded border border-gray-200"
                          />
                        </div>
                      )}
                      <form
                        action={uploadFunderLogo}
                        className="flex items-center gap-3"
                        encType="multipart/form-data"
                      >
                        <input type="hidden" name="logoData" id="funderLogoData" />
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.svg"
                          className="text-sm"
                          onChange={async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const hidden = document.getElementById("funderLogoData") as HTMLInputElement;
                              if (hidden) hidden.value = reader.result as string;
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        <Button type="submit" size="sm" variant="outline">Upload Logo</Button>
                      </form>
                    </div>
                  )}
                </div>
              ),

              documents: (
                <GrantDocuments
                  documents={grant.documents.map((d) => ({
                    ...d,
                    createdAt: d.createdAt.toISOString(),
                  }))}
                  grantId={grant.id}
                  uploadAction={uploadDocument}
                  deleteAction={deleteDocument}
                />
              ),

              correspondence: (
                <GrantComments
                  comments={grant.comments.map((c) => ({
                    ...c,
                    createdAt: c.createdAt.toISOString(),
                  }))}
                  grantId={grant.id}
                  contactEmail={grant.contactEmail}
                  contactPerson={grant.contactPerson}
                  teamMembers={teamMembers}
                  currentUserId={session.id}
                  addCommentAction={addComment}
                  sendEmailAction={sendGrantEmail}
                  deleteCommentAction={deleteComment}
                />
              ),

              requirements: (
                <GrantRequirements
                  requirements={grant.requirements.map((r) => ({
                    ...r,
                    dueDate: r.dueDate.toISOString(),
                    completedAt: r.completedAt?.toISOString() || null,
                  }))}
                  grantId={grant.id}
                  addAction={addRequirement}
                  updateStatusAction={updateRequirementStatus}
                  deleteAction={deleteRequirement}
                  uploadAttachmentAction={uploadRequirementAttachment}
                />
              ),

              restrictions: (
                <GrantRestrictions
                  restrictions={grant.restrictions.map((r) => ({
                    ...r,
                    amount: r.amount ? Number(r.amount) : null,
                    evidence: r.evidence.map((e) => ({
                      ...e,
                      amount: e.amount ? Number(e.amount) : null,
                      createdAt: e.createdAt.toISOString(),
                    })),
                  }))}
                  grantId={grant.id}
                  addRestrictionAction={addRestriction}
                  deleteRestrictionAction={deleteRestriction}
                  addEvidenceAction={addEvidence}
                />
              ),

              payments: (
                <GrantInstalments
                  instalments={grant.instalments.map((i) => ({
                    ...i,
                    amount: Number(i.amount),
                    expectedDate: i.expectedDate.toISOString(),
                    receivedDate: i.receivedDate?.toISOString() || null,
                  }))}
                  grantId={grant.id}
                  isSplitPayment={grant.isSplitPayment}
                  splitPeriodType={grant.splitPeriodType}
                  amountAwarded={grant.amountAwarded ? Number(grant.amountAwarded) : null}
                  toggleSplitAction={toggleSplit}
                  addInstalmentAction={addInstalment}
                  markReceivedAction={markReceived}
                  deleteInstalmentAction={deleteInstalment}
                />
              ),
            }}
          </GrantTabs>
        </CardContent>
      </Card>
    </div>
  );
}
