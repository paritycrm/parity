import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Shield, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { addDBSCheck, updateDBSStatus } from "./actions";

export default async function DBSPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status || "";

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const checks = await prisma.dBSCheck.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    include: {
      volunteer: { include: { contact: true } },
    },
    orderBy: { expiryDate: "asc" },
  });

  const expired = checks.filter(c => c.expiryDate < now && c.status !== "EXPIRED");
  const expiringIn30 = checks.filter(c => c.expiryDate >= now && c.expiryDate <= thirtyDays);
  const expiringIn90 = checks.filter(c => c.expiryDate > thirtyDays && c.expiryDate <= ninetyDays);
  const cleared = checks.filter(c => c.status === "CLEARED" && c.expiryDate > ninetyDays);

  const volunteers = await prisma.volunteerProfile.findMany({
    where: { status: "ACTIVE" },
    include: { contact: true },
    orderBy: { contact: { lastName: "asc" } },
  });

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    CLEARED: "bg-green-100 text-green-800",
    ISSUES_FOUND: "bg-red-100 text-red-800",
    EXPIRED: "bg-gray-100 text-gray-800",
  };

  const levelColors: Record<string, string> = {
    BASIC: "bg-blue-100 text-blue-800",
    STANDARD: "bg-indigo-100 text-indigo-800",
    ENHANCED: "bg-purple-100 text-purple-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DBS Checks</h1>
          <p className="text-gray-500 mt-1">Track and manage volunteer DBS checks</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-red-500">
          <p className="text-sm text-gray-500">Expired</p>
          <p className="text-2xl font-bold text-red-600">{expired.length}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-orange-500">
          <p className="text-sm text-gray-500">Expiring in 30 days</p>
          <p className="text-2xl font-bold text-orange-600">{expiringIn30.length}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-yellow-500">
          <p className="text-sm text-gray-500">Expiring in 90 days</p>
          <p className="text-2xl font-bold text-yellow-600">{expiringIn90.length}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-green-500">
          <p className="text-sm text-gray-500">All Clear</p>
          <p className="text-2xl font-bold text-green-600">{cleared.length}</p>
        </Card>
      </div>

      {/* Add DBS form */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add DBS Check</h2>
        <form action={addDBSCheck} className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Volunteer</label>
            <select name="volunteerId" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select...</option>
              {volunteers.map(v => (
                <option key={v.id} value={v.id}>
                  {v.contact.firstName} {v.contact.lastName}
                </option>
              ))}
            </select>
          </div>
          <Input label="Check Date" name="checkDate" type="date" required />
          <Input label="Expiry Date" name="expiryDate" type="date" required />
          <Input label="Certificate Number" name="certificateNumber" placeholder="Optional" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
            <select name="level" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="BASIC">Basic</option>
              <option value="STANDARD">Standard</option>
              <option value="ENHANCED">Enhanced</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select name="status" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="PENDING">Pending</option>
              <option value="CLEARED">Cleared</option>
              <option value="ISSUES_FOUND">Issues Found</option>
            </select>
          </div>
          <Input label="Cost (£)" name="cost" type="number" step="0.01" placeholder="0.00" />
          <div className="flex items-end">
            <Button type="submit">
              <Plus className="h-4 w-4 mr-2" />
              Add Check
            </Button>
          </div>
        </form>
      </Card>

      {/* Filter buttons */}
      <div className="flex gap-1">
        <Link href="/volunteers/dbs"><Button variant={!statusFilter ? "default" : "outline"} size="sm">All</Button></Link>
        {["PENDING", "CLEARED", "ISSUES_FOUND", "EXPIRED"].map(s => (
          <Link key={s} href={`/volunteers/dbs?status=${s}`}>
            <Button variant={statusFilter === s ? "default" : "outline"} size="sm">{s.replace("_", " ")}</Button>
          </Link>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Volunteer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Level</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Check Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Expiry Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Certificate</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {checks.map(check => {
              const isExpired = check.expiryDate < now;
              const isExpiring30 = check.expiryDate >= now && check.expiryDate <= thirtyDays;
              const isExpiring90 = check.expiryDate > thirtyDays && check.expiryDate <= ninetyDays;
              const rowBg = isExpired ? "bg-red-50" : isExpiring30 ? "bg-orange-50" : isExpiring90 ? "bg-yellow-50" : "";

              return (
                <tr key={check.id} className={`border-b last:border-0 ${rowBg}`}>
                  <td className="px-4 py-3">
                    <Link href={`/crm/contacts/${check.volunteer.contactId}`} className="text-indigo-600 hover:underline">
                      {check.volunteer.contact.firstName} {check.volunteer.contact.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><Badge className={levelColors[check.level]}>{check.level}</Badge></td>
                  <td className="px-4 py-3">{formatDate(check.checkDate)}</td>
                  <td className="px-4 py-3 font-medium">
                    {formatDate(check.expiryDate)}
                    {isExpired && <span className="ml-2 text-red-600 text-xs">EXPIRED</span>}
                    {isExpiring30 && <span className="ml-2 text-orange-600 text-xs">EXPIRING SOON</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{check.certificateNumber || "—"}</td>
                  <td className="px-4 py-3"><Badge className={statusColors[check.status]}>{check.status}</Badge></td>
                  <td className="px-4 py-3">
                    {check.status === "PENDING" && (
                      <form action={updateDBSStatus} className="inline">
                        <input type="hidden" name="checkId" value={check.id} />
                        <input type="hidden" name="status" value="CLEARED" />
                        <Button type="submit" size="sm" variant="outline">Mark Cleared</Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
