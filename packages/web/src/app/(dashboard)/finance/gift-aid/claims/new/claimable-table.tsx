"use client";

import { formatDate, formatShortDate } from '@/lib/utils';

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, AlertTriangle, Send, FlaskConical } from "lucide-react";

interface ClaimableDonation {
  id: string;
  contactId: string;
  contactName: string;
  postcode: string | null;
  amount: number;
  date: string; // ISO string
  type: string;
  method: string | null;
  reference: string | null;
  giftAidAmount: number;
  hasValidPostcode: boolean;
}

interface ClaimableTableProps {
  donations: ClaimableDonation[];
  claimReference: string;
  periodStart: string;
  periodEnd: string;
  claimType: "STANDARD" | "RETAIL";
  createAction: (formData: FormData) => Promise<void>;
}

export function ClaimableTable({
  donations,
  claimReference,
  periodStart,
  periodEnd,
  claimType,
  createAction,
}: ClaimableTableProps) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [isTestMode, setIsTestMode] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return donations;
    const q = search.toLowerCase();
    return donations.filter(
      (d) =>
        d.contactName.toLowerCase().includes(q) ||
        d.reference?.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q)
    );
  }, [donations, search]);

  const included = donations.filter((d) => !excluded.has(d.id));
  const totalDonations = included.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalGiftAid = included.reduce((sum, d) => sum + Number(d.giftAidAmount), 0);
  const invalidCount = included.filter((d) => !d.hasValidPostcode).length;

  function toggleExclude(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function excludeAll() {
    setExcluded(new Set(donations.map((d) => d.id)));
  }

  function includeAll() {
    setExcluded(new Set());
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(amount);
  }

  function formatDate(dateStr: string) {
    return formatDate(dateStr);
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Included</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{included.length}</p>
            <p className="text-xs text-gray-500">
              of {donations.length} eligible donations
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Total Donations</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalDonations)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Gift Aid Claimable</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrency(totalGiftAid)}</p>
            <p className="text-xs text-gray-500">25% of included donations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-gray-500 uppercase">Excluded</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{excluded.size}</p>
            <p className="text-xs text-gray-500">
              {formatCurrency(
                donations
                  .filter((d) => excluded.has(d.id))
                  .reduce((sum, d) => sum + Number(d.amount), 0)
              )}{" "}
              excluded
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warnings */}
      {invalidCount > 0 && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              {invalidCount} donation{invalidCount !== 1 ? "s" : ""} missing valid UK postcode
            </p>
            <p className="text-xs mt-0.5">
              HMRC requires a valid UK postcode for Gift Aid claims. These will be flagged as errors.
            </p>
          </div>
        </div>
      )}

      {/* Search + Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, reference, type..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={includeAll}>
            Include All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={excludeAll}>
            Exclude All
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
                  Inc.
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Donor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Postcode
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Reference
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Gift Aid
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((d) => {
                const isExcluded = excluded.has(d.id);
                return (
                  <tr
                    key={d.id}
                    className={`transition-colors ${
                      isExcluded
                        ? "bg-gray-50 opacity-60"
                        : !d.hasValidPostcode
                        ? "bg-amber-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={() => toggleExclude(d.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {d.contactName}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {d.postcode ? (
                        <span className={d.hasValidPostcode ? "text-gray-600" : "text-amber-700 font-medium"}>
                          {d.postcode}
                          {!d.hasValidPostcode && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-red-500 text-xs">Missing</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(d.date)}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-gray-100 text-gray-700 text-xs">{d.type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">
                      {d.reference || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(d.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-indigo-600 text-right">
                      {isExcluded ? "—" : formatCurrency(d.giftAidAmount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td colSpan={6} className="px-4 py-3 text-sm text-gray-700">
                  Totals ({included.length} included)
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900">
                  {formatCurrency(totalDonations)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-indigo-600">
                  {formatCurrency(totalGiftAid)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Submit */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <form action={createAction} className="space-y-4">
            <input type="hidden" name="reference" value={claimReference} />
            <input type="hidden" name="periodStart" value={periodStart} />
            <input type="hidden" name="periodEnd" value={periodEnd} />
            <input type="hidden" name="claimType" value={claimType} />
            <input
              type="hidden"
              name="excludedIds"
              value={JSON.stringify(Array.from(excluded))}
            />
            <input type="hidden" name="isTestMode" value={isTestMode ? "true" : "false"} />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isTestMode}
                    onChange={(e) => setIsTestMode(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <FlaskConical className="h-4 w-4 text-amber-600" />
                  <span className="text-gray-700">Test mode</span>
                </label>
                {isTestMode && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Will simulate HMRC submission — no real data sent
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                  disabled={included.length === 0}
                >
                  <Send className="h-4 w-4" />
                  Create Claim ({included.length} donations · {formatCurrency(totalGiftAid)})
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
