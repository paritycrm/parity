"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ExportDonation {
  id: string;
  date: string;
  contactName: string;
  type: string;
  method: string | null;
  reference: string | null;
  amount: number;
  ledgerCode: string | null;
  ledgerName: string | null;
  campaignName: string | null;
  bankDocRef: string | null;
  isGiftAidable: boolean;
}

export default function DailyExportPage() {
  const [date, setDate] = useState(
    new Date(Date.now() - 86400000).toISOString().split("T")[0] // yesterday
  );
  const [donations, setDonations] = useState<ExportDonation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadDonations() {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/daily-export?date=${date}`);
      const data = await res.json();
      setDonations(data.donations || []);
      setLoaded(true);
    } catch {
      setDonations([]);
    }
    setLoading(false);
  }

  function downloadCSV() {
    // Sage 50 compatible CSV format
    const headers = [
      "Type", "Account Ref", "Nominal A/C Ref", "Department",
      "Date", "Reference", "Details", "Net Amount", "Tax Code", "Tax Amount",
    ];

    const rows = donations.map((d) => [
      "SI", // Sales Invoice type for Sage
      "1200", // Default bank account code
      d.ledgerCode || "4000", // Nominal code - default to 4000 (Sales)
      "0", // Department
      formatDateSage(d.date),
      d.bankDocRef || d.reference || "",
      `${d.contactName} - ${d.type}${d.campaignName ? ` (${d.campaignName})` : ""}`,
      d.amount.toFixed(2),
      d.isGiftAidable ? "T1" : "T0",
      "0.00",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sage-export-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDateSage(dateStr: string) {
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  const total = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/donations" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Ledger Export</h1>
          <p className="text-gray-500 mt-1">Generate Sage 50 compatible CSV exports for a given date</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Export Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button onClick={loadDonations} disabled={loading} variant="outline">
              {loading ? "Loading..." : "Load Transactions"}
            </Button>
            {loaded && donations.length > 0 && (
              <Button onClick={downloadCSV} className="gap-2">
                <Download className="h-4 w-4" /> Download CSV for Sage 50
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {loaded && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Transactions for {new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </h3>
              <span className="text-sm text-gray-500">{donations.length} transaction{donations.length !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent>
            {donations.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No transactions found for this date.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ledger</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bank Doc</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">GA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {donations.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.contactName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{d.type}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{d.method || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">{d.reference || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{d.ledgerCode || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{d.campaignName || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{d.bankDocRef || "—"}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">£{d.amount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          {d.isGiftAidable ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" /> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan={7} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total</td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">£{total.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
