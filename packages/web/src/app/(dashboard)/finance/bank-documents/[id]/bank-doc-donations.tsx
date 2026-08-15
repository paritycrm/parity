"use client";

import { useState } from "react";
import { CheckCircle, Edit2, X, Save, User } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactSearchSelect } from "@/components/ui/contact-search-select";

interface Donation {
  id: string;
  contactId: string;
  contactName: string;
  donorId: number;
  date: string;
  type: string;
  method: string;
  reference: string;
  amount: number;
  ledgerCodeId: string;
  ledgerCode: string;
  campaignId: string;
  campaignName: string;
  eventId: string;
  eventName: string;
  isGiftAidable: boolean;
  notes: string;
}

interface RefOption {
  id: string;
  name: string;
  code?: string;
}

interface BankDocDonationsProps {
  donations: Donation[];
  paymentMethods: RefOption[];
  ledgerCodes: RefOption[];
  campaigns: RefOption[];
  events: RefOption[];
}

export function BankDocDonations({
  donations: initialDonations,
  paymentMethods,
  ledgerCodes,
  campaigns,
  events,
}: BankDocDonationsProps) {
  const [donations, setDonations] = useState(initialDonations);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Donation>>({});
  const [saving, setSaving] = useState(false);
  const [contactKey, setContactKey] = useState(0);

  const total = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  function startEdit(d: Donation) {
    setEditingId(d.id);
    setEditData({ ...d });
    setContactKey((k) => k + 1);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditData({});
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/finance/donations/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: editData.contactId,
          amount: editData.amount,
          type: editData.type,
          method: editData.method || null,
          reference: editData.reference || null,
          date: editData.date,
          ledgerCodeId: editData.ledgerCodeId || null,
          campaignId: editData.campaignId || null,
          eventId: editData.eventId || null,
          isGiftAidable: editData.isGiftAidable,
          notes: editData.notes || null,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setDonations((prev) =>
          prev.map((d) =>
            d.id === editingId
              ? {
                  ...d,
                  contactId: updated.contactId || d.contactId,
                  contactName: updated.contactName || d.contactName,
                  donorId: updated.donorId || d.donorId,
                  amount: updated.amount ?? d.amount,
                  type: updated.type || d.type,
                  method: updated.method || "",
                  reference: updated.reference || "",
                  date: updated.date?.split("T")[0] || d.date,
                  ledgerCode: updated.ledgerCode || "",
                  isGiftAidable: updated.isGiftAidable ?? d.isGiftAidable,
                  // Keep local-only fields
                  ledgerCodeId: editData.ledgerCodeId || "",
                  campaignId: editData.campaignId || "",
                  campaignName: campaigns.find((c) => c.id === editData.campaignId)?.name || "",
                  eventId: editData.eventId || "",
                  eventName: events.find((e) => e.id === editData.eventId)?.name || "",
                  notes: editData.notes || "",
                }
              : d
          )
        );
        setEditingId(null);
        setEditData({});
      }
    } catch (err) {
      console.error("Failed to save:", err);
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-gray-900">Donations ({donations.length})</h3>
      </CardHeader>
      <CardContent>
        {donations.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No donations in this bank document. Donations are added automatically when you use the Record Donations page.
          </p>
        ) : (
          <div className="space-y-0">
            {/* Table header */}
            <div className="grid grid-cols-[40px_1fr_80px_100px_100px_80px_90px_50px_50px] gap-2 px-3 py-2 text-xs font-medium text-gray-500 uppercase border-b border-gray-200">
              <span>#</span>
              <span>Contact</span>
              <span>Date</span>
              <span>Type</span>
              <span>Method</span>
              <span>Ledger</span>
              <span className="text-right">Amount</span>
              <span className="text-center">GA</span>
              <span></span>
            </div>

            {donations.map((d, i) => (
              <div key={d.id}>
                {/* Read row */}
                {editingId !== d.id && (
                  <div
                    className="grid grid-cols-[40px_1fr_80px_100px_100px_80px_90px_50px_50px] gap-2 px-3 py-2.5 text-sm items-center hover:bg-gray-50 border-b border-gray-50 cursor-pointer"
                    onClick={() => startEdit(d)}
                  >
                    <span className="text-gray-400">{i + 1}</span>
                    <div>
                      <span className="font-medium text-gray-900">{d.contactName}</span>
                      <span className="text-xs text-gray-400 ml-1.5 font-mono">#{String(d.donorId).padStart(5, "0")}</span>
                    </div>
                    <span className="text-gray-600">{d.date.split("-").reverse().join("-")}</span>
                    <span className="text-gray-600">{d.type}</span>
                    <span className="text-gray-600">{d.method || "—"}</span>
                    <span className="text-gray-600">{d.ledgerCode || "—"}</span>
                    <span className="font-medium text-gray-900 text-right">£{d.amount.toFixed(2)}</span>
                    <span className="text-center">
                      {d.isGiftAidable ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <span className="text-gray-300">—</span>}
                    </span>
                    <span>
                      <Edit2 className="h-3.5 w-3.5 text-gray-300" />
                    </span>
                  </div>
                )}

                {/* Edit row */}
                {editingId === d.id && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 my-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-indigo-900">Editing donation #{i + 1}</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelEdit} className="gap-1 h-7 text-xs">
                          <X className="h-3 w-3" /> Cancel
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1 h-7 text-xs">
                          <Save className="h-3 w-3" /> {saving ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Contact</label>
                        <ContactSearchSelect
                          key={contactKey}
                          name={`edit-contact-${d.id}`}
                          defaultValue={editData.contactId}
                          defaultLabel={editData.contactName}
                          onSelect={(c) => {
                            if (c) {
                              setEditData((prev) => ({ ...prev, contactId: c.id, contactName: `${c.firstName} ${c.lastName}`, donorId: c.donorId }));
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                        <input
                          type="date"
                          value={editData.date || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, date: e.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Amount (£)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editData.amount || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                        <select
                          value={editData.type || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, type: e.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="DONATION">Donation</option>
                          <option value="PAYMENT">Payment</option>
                          <option value="GIFT">Gift</option>
                          <option value="EVENT_FEE">Event Fee</option>
                          <option value="SPONSORSHIP">Sponsorship</option>
                          <option value="LEGACY">Legacy</option>
                          <option value="GRANT">Grant</option>
                          <option value="IN_KIND">In Kind</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
                        <select
                          value={editData.method || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, method: e.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">None</option>
                          {paymentMethods.map((pm) => (
                            <option key={pm.id} value={pm.name}>{pm.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
                        <input
                          type="text"
                          value={editData.reference || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, reference: e.target.value }))}
                          placeholder="Receipt / cheque no."
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Ledger Code</label>
                        <select
                          value={editData.ledgerCodeId || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, ledgerCodeId: e.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">None</option>
                          {ledgerCodes.map((lc) => (
                            <option key={lc.id} value={lc.id}>{lc.code} - {lc.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Campaign</label>
                        <select
                          value={editData.campaignId || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, campaignId: e.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">None</option>
                          {campaigns.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Event</label>
                        <select
                          value={editData.eventId || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, eventId: e.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        >
                          <option value="">None</option>
                          {events.map((e) => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editData.isGiftAidable || false}
                          onChange={(e) => setEditData((prev) => ({ ...prev, isGiftAidable: e.target.checked }))}
                          className="rounded border-gray-300"
                        />
                        <label className="text-xs font-medium text-gray-700">Gift Aid Eligible</label>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={editData.notes || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, notes: e.target.value }))}
                          placeholder="Notes"
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Total */}
            <div className="grid grid-cols-[40px_1fr_80px_100px_100px_80px_90px_50px_50px] gap-2 px-3 py-3 text-sm font-semibold border-t-2 border-gray-200">
              <span></span>
              <span className="text-gray-900">{donations.length} donation{donations.length !== 1 ? "s" : ""}</span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span className="text-right text-gray-900">£{total.toFixed(2)}</span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
