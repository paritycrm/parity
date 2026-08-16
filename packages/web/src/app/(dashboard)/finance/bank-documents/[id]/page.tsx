import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Lock, Heart, Mail, FileText as FileTextIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import { BankDocDonations } from "./bank-doc-donations";

export default async function BankDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAuth();

  const bankDoc = await prisma.bankDocument.findUnique({
    where: { id },
    include: {
      createdBy: true,
      donations: {
        include: {
          contact: {
            select: {
              id: true, firstName: true, lastName: true, donorId: true,
              email: true, consentEmail: true,
              giftAids: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
            },
          },
          ledgerCode: { select: { id: true, code: true, name: true } },
          campaign: { select: { id: true, name: true } },
          event: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!bankDoc) notFound();

  const [paymentMethods, ledgerCodes, campaigns, events] = await Promise.all([
    prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.ledgerCode.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.campaign.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.event.findMany({ where: { status: { not: "CANCELLED" } }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);

  async function closeDoc() {
    "use server";
    const session = await requireAuth();
    await prisma.bankDocument.update({ where: { id }, data: { status: "CLOSED" } });
    await logAudit({ userId: session.id, action: "UPDATE", entityType: "BankDocument", entityId: id, details: { status: "CLOSED" } });
    revalidatePath(`/finance/bank-documents/${id}`);
    revalidatePath("/finance/bank-documents");
    redirect(`/finance/bank-documents/${id}`);
  }

  async function reopenDoc() {
    "use server";
    const session = await requireAuth();
    await prisma.bankDocument.update({ where: { id }, data: { status: "OPEN" } });
    await logAudit({ userId: session.id, action: "UPDATE", entityType: "BankDocument", entityId: id, details: { status: "REOPENED" } });
    revalidatePath(`/finance/bank-documents/${id}`);
    revalidatePath("/finance/bank-documents");
    redirect(`/finance/bank-documents/${id}`);
  }

  const total = bankDoc.donations.reduce((sum, d) => sum + Number(d.amount), 0);
  const statusColors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800",
    CLOSED: "bg-green-100 text-green-800",
  };

  // Gift Aid report: find unique contacts who donated GA-eligible types but have no active GA declaration
  const donationTypes = await prisma.donationType.findMany({ select: { name: true, isGiftAidEligible: true } });
  const gaEligibleTypes = new Set(donationTypes.filter((dt) => dt.isGiftAidEligible).map((dt) => dt.name));

  const contactsWithoutGA: { id: string; name: string; donorId: number; email: string; canEmail: boolean; totalDonated: number }[] = [];
  const seenContactIds = new Set<string>();

  for (const d of bankDoc.donations) {
    if (!gaEligibleTypes.has(d.type)) continue;
    if (d.contact.giftAids.length > 0) continue; // already has GA
    if (seenContactIds.has(d.contact.id)) {
      // Add to existing total
      const existing = contactsWithoutGA.find((c) => c.id === d.contact.id);
      if (existing) existing.totalDonated += Number(d.amount);
      continue;
    }
    seenContactIds.add(d.contact.id);
    contactsWithoutGA.push({
      id: d.contact.id,
      name: `${d.contact.firstName} ${d.contact.lastName}`,
      donorId: d.contact.donorId,
      email: d.contact.email || "",
      canEmail: !!(d.contact.email && d.contact.consentEmail),
      totalDonated: Number(d.amount),
    });
  }

  // Serialize donations for client component
  const donations = bankDoc.donations.map((d) => ({
    id: d.id,
    contactId: d.contact.id,
    contactName: `${d.contact.firstName} ${d.contact.lastName}`,
    donorId: d.contact.donorId,
    date: d.date.toISOString().split("T")[0],
    type: d.type,
    method: d.method || "",
    reference: d.reference || "",
    amount: Number(d.amount),
    ledgerCodeId: d.ledgerCode?.id || "",
    ledgerCode: d.ledgerCode?.code || "",
    campaignId: d.campaign?.id || "",
    campaignName: d.campaign?.name || "",
    eventId: d.event?.id || "",
    eventName: d.event?.name || "",
    isGiftAidable: d.isGiftAidable,
    notes: d.notes || "",
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/bank-documents" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{bankDoc.reference}</h1>
            <Badge className={statusColors[bankDoc.status]}>{bankDoc.status}</Badge>
          </div>
          <p className="text-gray-500 mt-1">
            {formatDate(bankDoc.date)} &middot; Created by {bankDoc.createdBy.name} &middot; {bankDoc.donations.length} items &middot; £{total.toFixed(2)}
          </p>
        </div>
        <div className="flex gap-2">
          {bankDoc.status === "OPEN" && (
            <form action={closeDoc}>
              <Button type="submit" className="gap-2">
                <Lock className="h-4 w-4" /> Close Bank Document
              </Button>
            </form>
          )}
          {bankDoc.status === "CLOSED" && (
            <form action={reopenDoc}>
              <Button type="submit" variant="outline" className="gap-2">Reopen</Button>
            </form>
          )}
        </div>
      </div>

      <BankDocDonations
        donations={donations}
        paymentMethods={paymentMethods}
        ledgerCodes={ledgerCodes}
        campaigns={campaigns}
        events={events}
      />

      {/* Gift Aid Report — only shown when document is CLOSED */}
      {bankDoc.status === "CLOSED" && contactsWithoutGA.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-500" />
              <h2 className="text-lg font-semibold text-gray-900">Gift Aid Opportunities</h2>
              <Badge className="bg-rose-100 text-rose-800">{contactsWithoutGA.length}</Badge>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              These contacts made Gift Aid eligible donations on this bank document but don&apos;t have an active Gift Aid declaration. Consider reaching out to invite them to register.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-[60px_1fr_140px_80px_60px] gap-3 text-xs font-medium text-gray-500 uppercase tracking-wider px-3 pb-2 border-b">
                <span>ID</span>
                <span>Name</span>
                <span>Email</span>
                <span className="text-right">Donated</span>
                <span className="text-center">Action</span>
              </div>
              {contactsWithoutGA.map((c) => (
                <div key={c.id} className="grid grid-cols-[60px_1fr_140px_80px_60px] gap-3 items-center px-3 py-2 rounded-lg hover:bg-gray-50">
                  <span className="font-mono text-xs text-gray-400">#{String(c.donorId).padStart(5, "0")}</span>
                  <Link href={`/crm/contacts/${c.id}`} className="text-sm font-medium text-indigo-600 hover:underline truncate">
                    {c.name}
                  </Link>
                  <span className="text-sm text-gray-500 truncate">{c.email || "—"}</span>
                  <span className="text-sm font-medium text-gray-900 text-right">£{c.totalDonated.toFixed(2)}</span>
                  <div className="flex justify-center">
                    {c.canEmail ? (
                      <span title="Can be emailed" className="text-green-600"><Mail className="h-4 w-4" /></span>
                    ) : (
                      <span title="No email consent" className="text-gray-300"><Mail className="h-4 w-4" /></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {contactsWithoutGA.filter((c) => c.canEmail).length} of {contactsWithoutGA.length} contacts can be emailed
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileTextIcon className="h-3.5 w-3.5" /> Generate Letters
                </Button>
                <Button size="sm" className="gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> Send Gift Aid Invites
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
