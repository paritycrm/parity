"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, CheckCircle2, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Instalment {
  id: string;
  periodLabel: string;
  amount: number;
  expectedDate: string;
  receivedDate: string | null;
  received: boolean;
}

export function GrantInstalments({
  instalments,
  grantId,
  isSplitPayment,
  splitPeriodType,
  amountAwarded,
  toggleSplitAction,
  addInstalmentAction,
  markReceivedAction,
  deleteInstalmentAction,
}: {
  instalments: Instalment[];
  grantId: string;
  isSplitPayment: boolean;
  splitPeriodType: string | null;
  amountAwarded: number | null;
  toggleSplitAction: (formData: FormData) => Promise<void>;
  addInstalmentAction: (formData: FormData) => Promise<void>;
  markReceivedAction: (formData: FormData) => Promise<void>;
  deleteInstalmentAction: (formData: FormData) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalScheduled = instalments.reduce((sum, i) => sum + i.amount, 0);
  const totalReceived = instalments.filter((i) => i.received).reduce((sum, i) => sum + i.amount, 0);
  const upcoming = instalments.filter((i) => !i.received && new Date(i.expectedDate) > new Date());
  const overdue = instalments.filter((i) => !i.received && new Date(i.expectedDate) <= new Date());

  const fmt = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("grantId", grantId);
    startTransition(() => addInstalmentAction(formData));
    setShowForm(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Payment Schedule</h3>
        <form action={toggleSplitAction}>
          <input type="hidden" name="grantId" value={grantId} />
          <input type="hidden" name="isSplitPayment" value={isSplitPayment ? "false" : "true"} />
          <Button type="submit" variant={isSplitPayment ? "default" : "outline"} size="sm">
            {isSplitPayment ? "Split Payment: ON" : "Enable Split Payment"}
          </Button>
        </form>
      </div>

      {!isSplitPayment ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          This grant is set as a single payment. Enable split payment to track multiple instalments.
        </p>
      ) : (
        <>
          {/* Period type selector */}
          <form action={toggleSplitAction} className="flex items-center gap-3">
            <input type="hidden" name="grantId" value={grantId} />
            <input type="hidden" name="isSplitPayment" value="true" />
            <label className="text-sm text-gray-600">Period type:</label>
            <select
              name="splitPeriodType"
              defaultValue={splitPeriodType || "YEAR"}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="MONTH">Monthly</option>
              <option value="QUARTER">Quarterly</option>
              <option value="YEAR">Yearly</option>
            </select>
            <button type="submit" className="text-xs text-indigo-600 hover:text-indigo-800">
              Save
            </button>
          </form>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Scheduled</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalScheduled)}</p>
              {amountAwarded && totalScheduled !== amountAwarded && (
                <p className="text-xs text-amber-600">
                  {fmt(amountAwarded - totalScheduled)} unscheduled
                </p>
              )}
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-xs text-gray-500">Received</p>
              <p className="text-lg font-bold text-green-700">{fmt(totalReceived)}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-500">Upcoming</p>
              <p className="text-lg font-bold text-blue-700">
                {upcoming.length} ({fmt(upcoming.reduce((s, i) => s + i.amount, 0))})
              </p>
              {overdue.length > 0 && (
                <p className="text-xs text-red-600">{overdue.length} overdue</p>
              )}
            </div>
          </div>

          {/* Instalment list */}
          <div className="space-y-2">
            {instalments.map((inst) => {
              const isOverdue = !inst.received && new Date(inst.expectedDate) <= new Date();
              return (
                <div
                  key={inst.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    inst.received
                      ? "border-green-200 bg-green-50"
                      : isOverdue
                        ? "border-red-200 bg-red-50"
                        : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {inst.received ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : isOverdue ? (
                      <Clock className="h-5 w-5 text-red-500" />
                    ) : (
                      <CalendarDays className="h-5 w-5 text-gray-400" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{inst.periodLabel}</p>
                      <p className="text-xs text-gray-500">
                        {inst.received
                          ? `Received ${new Date(inst.receivedDate!).toLocaleDateString("en-GB")}`
                          : `Expected ${new Date(inst.expectedDate).toLocaleDateString("en-GB")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900">{fmt(inst.amount)}</span>
                    {!inst.received && (
                      <form action={markReceivedAction}>
                        <input type="hidden" name="instalmentId" value={inst.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Mark Received
                        </Button>
                      </form>
                    )}
                    <form action={deleteInstalmentAction}>
                      <input type="hidden" name="instalmentId" value={inst.id} />
                      <button
                        type="submit"
                        className="text-red-500 hover:text-red-700"
                        onClick={(e) => {
                          if (!confirm("Delete this instalment?")) e.preventDefault();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add instalment form */}
          {showForm ? (
            <form onSubmit={handleAdd} className="p-4 border border-gray-200 rounded-lg space-y-3 bg-gray-50">
              <Input label="Period Label *" name="periodLabel" required placeholder={`e.g. ${splitPeriodType === "MONTH" ? "Month 1" : splitPeriodType === "QUARTER" ? "Q1 2025" : "Year 1"}`} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Amount *" name="amount" type="number" step="0.01" required placeholder="£0.00" />
                <Input label="Expected Date *" name="expectedDate" type="date" required />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isPending}>Add Instalment</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Instalment
            </Button>
          )}
        </>
      )}
    </div>
  );
}
