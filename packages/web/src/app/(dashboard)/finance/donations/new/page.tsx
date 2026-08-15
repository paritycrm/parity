"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Plus, Lock, FileText } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactSearchSelect } from "@/components/ui/contact-search-select";

interface RecordedDonation {
  id: string;
  contactName: string;
  donorId: number;
  amount: number;
  type: string;
  method: string | null;
}

interface SelectOption {
  id: string;
  name: string;
  code?: string;
  label?: string;
  ledgerCodeId?: string | null;
  defaultLedgerCodeId?: string | null;
  isGiftAidEligible?: boolean;
}

export default function NewDonationPage() {
  const router = useRouter();

  // Session state
  const [bankDocId, setBankDocId] = useState<string | null>(null);
  const [bankDocRef, setBankDocRef] = useState<string>("");
  const [recorded, setRecorded] = useState<RecordedDonation[]>([]);
  const [sessionClosed, setSessionClosed] = useState(false);

  // Form state
  const [contactId, setContactId] = useState("");
  const [contactHasGA, setContactHasGA] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("DONATION");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [ledgerCodeId, setLedgerCodeId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [eventId, setEventId] = useState("");
  const [isGiftAidable, setIsGiftAidable] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [contactKey, setContactKey] = useState(0);

  // Reference data
  const [campaigns, setCampaigns] = useState<SelectOption[]>([]);
  const [ledgerCodes, setLedgerCodes] = useState<SelectOption[]>([]);
  const [events, setEvents] = useState<SelectOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<SelectOption[]>([]);
  const [donationTypes, setDonationTypes] = useState<SelectOption[]>([]);

  // Load reference data on mount
  useEffect(() => {
    async function load() {
      const [campRes, lcRes, evtRes, pmRes, dtRes] = await Promise.all([
        fetch("/api/finance/reference-data?type=campaigns"),
        fetch("/api/finance/reference-data?type=ledger-codes"),
        fetch("/api/finance/reference-data?type=events"),
        fetch("/api/finance/reference-data?type=payment-methods"),
        fetch("/api/finance/reference-data?type=donation-types"),
      ]);
      setCampaigns(await campRes.json());
      setLedgerCodes(await lcRes.json());
      setEvents(await evtRes.json());
      setPaymentMethods(await pmRes.json());
      setDonationTypes(await dtRes.json());
    }
    load();
  }, []);

  // Auto-compute Gift Aid + auto-populate ledger code from type
  useEffect(() => {
    const selectedType = donationTypes.find((dt) => dt.name === type);
    const typeEligible = selectedType?.isGiftAidEligible ?? false;
    setIsGiftAidable(typeEligible && contactHasGA);
    // Auto-set ledger code from donation type default
    if (selectedType?.defaultLedgerCodeId) {
      setLedgerCodeId(selectedType.defaultLedgerCodeId);
    } else {
      setLedgerCodeId("");
    }
  }, [type, contactHasGA, donationTypes]);

  // Auto-create bank document on first donation
  async function ensureBankDoc(): Promise<string> {
    if (bankDocId) return bankDocId;

    const res = await fetch("/api/finance/bank-documents", { method: "POST" });
    const data = await res.json();
    setBankDocId(data.id);
    setBankDocRef(data.reference);
    return data.id;
  }

  async function handleRecordDonation(andNext: boolean) {
    if (!contactId || !amount || !type || !date) return;
    setSaving(true);

    try {
      const docId = await ensureBankDoc();

      const res = await fetch("/api/finance/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          amount,
          type,
          method: method || null,
          reference: reference || null,
          date,
          ledgerCodeId: ledgerCodeId || null,
          campaignId: campaignId || null,
          eventId: eventId || null,
          isGiftAidable,
          notes: notes || null,
          bankDocumentId: docId,
        }),
      });

      if (!res.ok) throw new Error("Failed to record donation");

      const donation = await res.json();
      setRecorded((prev) => [...prev, donation]);

      if (andNext) {
        // Reset form for next entry
        setContactId("");
        setContactHasGA(false);
        setAmount("");
        setMethod("");
        setReference("");
        setLedgerCodeId("");
        setCampaignId("");
        setEventId("");
        setIsGiftAidable(false);
        setNotes("");
        setContactKey((k) => k + 1);
      } else {
        // Done — go to donation detail
        router.push(`/finance/donations/${donation.id}`);
      }
    } catch (err) {
      console.error(err);
    }

    setSaving(false);
  }

  async function handleCloseSession() {
    if (!bankDocId) return;
    await fetch("/api/finance/bank-documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bankDocId, status: "CLOSED" }),
    });
    setSessionClosed(true);
  }

  const sessionTotal = recorded.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/donations" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Record Donations</h1>
          <p className="text-gray-500 mt-1">
            {bankDocRef ? (
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Bank Document: <span className="font-mono font-medium text-gray-700">{bankDocRef}</span>
                &middot; {recorded.length} recorded &middot; £{sessionTotal.toFixed(2)}
              </span>
            ) : (
              "A bank document will be created automatically when you record your first donation"
            )}
          </p>
        </div>
      </div>

      {/* Session summary — recorded items */}
      {recorded.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="space-y-1.5">
              {recorded.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3 text-sm py-1">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="font-mono text-xs text-gray-400 w-10">#{String(d.donorId).padStart(5, "0")}</span>
                  <span className="text-gray-900 font-medium flex-1">{d.contactName}</span>
                  <span className="text-gray-500">{d.type}</span>
                  <span className="text-gray-500">{d.method || ""}</span>
                  <span className="font-medium text-gray-900">£{d.amount.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
                <span className="text-sm font-semibold text-gray-900">{recorded.length} donation{recorded.length !== 1 ? "s" : ""}</span>
                <span className="text-sm font-bold text-gray-900">£{sessionTotal.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session closed */}
      {sessionClosed ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Lock className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900">Session Closed</h2>
            <p className="text-sm text-gray-500 mt-1">
              Bank document <span className="font-mono font-medium">{bankDocRef}</span> has been closed with {recorded.length} donation{recorded.length !== 1 ? "s" : ""} totalling £{sessionTotal.toFixed(2)}.
            </p>
            <div className="flex justify-center gap-3 mt-6">
              <Link href={`/finance/bank-documents/${bankDocId}`}>
                <Button variant="outline">View Bank Document</Button>
              </Link>
              <Link href="/finance/donations/new">
                <Button>Start New Session</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Donation form */
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">
              {recorded.length > 0 ? `Donation #${recorded.length + 1}` : "New Donation"}
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {/* Row 1: Contact + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                  <ContactSearchSelect
                    key={contactKey}
                    name="contactId"
                    required
                    onSelect={(c) => {
                      if (c) {
                        setContactId(c.id);
                        setContactHasGA(c.hasGiftAid);
                        setIsGiftAidable(c.hasGiftAid);
                      } else {
                        setContactId("");
                        setContactHasGA(false);
                        setIsGiftAidable(false);
                      }
                    }}
                  />
                  {contactHasGA && (
                    <p className="text-xs text-green-600 mt-1 font-medium">Active Gift Aid declaration on file</p>
                  )}
                  {contactId && !contactHasGA && (
                    <p className="text-xs text-amber-600 mt-1">No Gift Aid declaration — consider sending one</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 2: Amount + Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {donationTypes.map((dt) => (
                      <option key={dt.name} value={dt.name}>
                        {dt.label}{dt.isGiftAidEligible ? " (GA)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Method + Reference */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select method...</option>
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.name}>{pm.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Receipt / cheque no."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 4: Campaign / Event (grouped dropdown) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign / Event</label>
                <select
                  value={campaignId ? `campaign:${campaignId}` : eventId ? `event:${eventId}` : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith("campaign:")) {
                      setCampaignId(val.replace("campaign:", ""));
                      setEventId("");
                    } else if (val.startsWith("event:")) {
                      setEventId(val.replace("event:", ""));
                      setCampaignId("");
                    } else {
                      setCampaignId("");
                      setEventId("");
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {campaigns.length > 0 && (
                    <optgroup label="Campaigns">
                      {campaigns.map((c) => (
                        <option key={c.id} value={`campaign:${c.id}`}>{c.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {events.length > 0 && (
                    <optgroup label="Events">
                      {events.map((e) => (
                        <option key={e.id} value={`event:${e.id}`}>{e.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Gift Aid + Notes */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isGiftAidable"
                    checked={isGiftAidable}
                    onChange={(e) => setIsGiftAidable(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="isGiftAidable" className="text-sm font-medium text-gray-700">
                    Gift Aid
                  </label>
                  {isGiftAidable && (
                    <span className="text-[10px] text-green-600 font-medium ml-1">(auto: type eligible + GA registered)</span>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div>
                  {recorded.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseSession}
                      className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Lock className="h-4 w-4" /> Close Session ({recorded.length} recorded)
                    </Button>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || !contactId || !amount}
                    onClick={() => handleRecordDonation(false)}
                  >
                    Record &amp; Finish
                  </Button>
                  <Button
                    type="button"
                    disabled={saving || !contactId || !amount}
                    onClick={() => handleRecordDonation(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {saving ? "Saving..." : "Record & Next"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
