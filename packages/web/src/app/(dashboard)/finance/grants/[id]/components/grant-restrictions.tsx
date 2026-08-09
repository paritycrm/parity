"use client";

import { useState, useTransition } from "react";
import { Plus, ShieldCheck, Upload, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Evidence {
  id: string;
  description: string;
  amount: number | null;
  fileName: string | null;
  createdAt: string;
}

interface Restriction {
  id: string;
  description: string;
  amount: number | null;
  evidence: Evidence[];
}

export function GrantRestrictions({
  restrictions,
  grantId,
  addRestrictionAction,
  deleteRestrictionAction,
  addEvidenceAction,
}: {
  restrictions: Restriction[];
  grantId: string;
  addRestrictionAction: (formData: FormData) => Promise<void>;
  deleteRestrictionAction: (formData: FormData) => Promise<void>;
  addEvidenceAction: (formData: FormData) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [addingEvidenceFor, setAddingEvidenceFor] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAddRestriction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("grantId", grantId);
    startTransition(() => addRestrictionAction(formData));
    setShowForm(false);
  }

  async function handleAddEvidence(e: React.FormEvent<HTMLFormElement>, restrictionId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("restrictionId", restrictionId);

    // Handle file upload if present
    const file = formData.get("file") as File;
    if (file && file.size > 0) {
      const apiForm = new FormData();
      apiForm.append("file", file);
      const res = await fetch("/api/grants/documents", { method: "POST", body: apiForm });
      const data = await res.json();
      if (data.success) {
        formData.set("fileName", data.fileName);
        formData.set("fileType", data.fileType);
        formData.set("fileData", data.fileData);
      }
    }
    formData.delete("file");

    startTransition(() => addEvidenceAction(formData));
    setAddingEvidenceFor(null);
  }

  const fmt = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Restrictions</h3>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Restriction
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleAddRestriction} className="p-4 border border-gray-200 rounded-lg space-y-3 bg-gray-50">
          <Input label="Restriction *" name="description" required placeholder="e.g. Must be used for equipment purchase" />
          <Input label="Restricted Amount" name="amount" type="number" step="0.01" placeholder="£0.00" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>Save</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {restrictions.length === 0 && !showForm ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No restrictions recorded. Add any spending restrictions the grant requires.
        </p>
      ) : (
        <div className="space-y-4">
          {restrictions.map((restriction) => {
            const evidencedAmount = restriction.evidence.reduce(
              (sum, e) => sum + (e.amount || 0),
              0
            );
            const isFullyEvidenced =
              restriction.amount && evidencedAmount >= restriction.amount;

            return (
              <div key={restriction.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-4 bg-white">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <ShieldCheck
                        className={`h-5 w-5 mt-0.5 ${
                          isFullyEvidenced ? "text-green-500" : "text-amber-500"
                        }`}
                      />
                      <div>
                        <p className="font-medium text-gray-900">{restriction.description}</p>
                        {restriction.amount && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            Restricted: {fmt(restriction.amount)} · Evidenced: {fmt(evidencedAmount)}
                            {isFullyEvidenced && (
                              <CheckCircle2 className="inline h-4 w-4 text-green-500 ml-1" />
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                        onClick={() =>
                          setAddingEvidenceFor(
                            addingEvidenceFor === restriction.id ? null : restriction.id
                          )
                        }
                      >
                        + Evidence
                      </button>
                      <form action={deleteRestrictionAction}>
                        <input type="hidden" name="restrictionId" value={restriction.id} />
                        <button
                          type="submit"
                          className="text-red-500 hover:text-red-700"
                          onClick={(e) => {
                            if (!confirm("Delete this restriction and all evidence?"))
                              e.preventDefault();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  </div>
                </div>

                {/* Evidence list */}
                {restriction.evidence.length > 0 && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {restriction.evidence.map((ev) => (
                      <div key={ev.id} className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="text-gray-700">{ev.description}</span>
                          {ev.amount && (
                            <span className="text-gray-500 ml-2">{fmt(ev.amount)}</span>
                          )}
                          {ev.fileName && (
                            <span className="text-xs text-indigo-600 ml-2">{ev.fileName}</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(ev.createdAt).toLocaleDateString("en-GB")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add evidence form */}
                {addingEvidenceFor === restriction.id && (
                  <form
                    onSubmit={(e) => handleAddEvidence(e, restriction.id)}
                    className="p-4 border-t border-gray-200 bg-gray-50 space-y-3"
                  >
                    <Input label="Description *" name="description" required placeholder="e.g. Purchased coffee machine from Argos" />
                    <Input label="Amount" name="amount" type="number" step="0.01" placeholder="£0.00" />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Supporting Document
                      </label>
                      <input
                        type="file"
                        name="file"
                        className="text-sm text-gray-600"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={isPending}>Save Evidence</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setAddingEvidenceFor(null)}>Cancel</Button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
