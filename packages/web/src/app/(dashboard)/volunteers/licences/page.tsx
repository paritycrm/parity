import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Car, Plus, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { addDrivingLicence, verifyLicence } from "./actions";

export default async function LicencesPage() {
  const licences = await prisma.drivingLicence.findMany({
    include: {
      volunteer: { include: { contact: true } },
    },
    orderBy: { expiryDate: "asc" },
  });

  const volunteers = await prisma.volunteerProfile.findMany({
    where: {
      status: "ACTIVE",
      drivingLicence: null,
    },
    include: { contact: true },
    orderBy: { contact: { lastName: "asc" } },
  });

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driving Licences</h1>
          <p className="text-gray-500 mt-1">Track volunteer driving licences for route assignments</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Total on File</p>
          <p className="text-2xl font-bold">{licences.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Verified</p>
          <p className="text-2xl font-bold text-green-600">{licences.filter(l => l.verifiedAt).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Expiring Soon</p>
          <p className="text-2xl font-bold text-orange-600">
            {licences.filter(l => l.expiryDate && l.expiryDate < thirtyDays && l.expiryDate > now).length}
          </p>
        </Card>
      </div>

      {/* Add licence form */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Driving Licence</h2>
        <form action={addDrivingLicence} className="grid grid-cols-4 gap-4">
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
          <Input label="Licence Number" name="licenceNumber" placeholder="Optional" />
          <Input label="Expiry Date" name="expiryDate" type="date" />
          <div className="flex items-end">
            <Button type="submit">
              <Plus className="h-4 w-4 mr-2" />
              Add Licence
            </Button>
          </div>
        </form>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Volunteer</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Licence Number</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Expiry</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Verified</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {licences.map(licence => {
              const expired = licence.expiryDate && licence.expiryDate < now;
              return (
                <tr key={licence.id} className={`border-b last:border-0 ${expired ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-3">
                    <Link href={`/crm/contacts/${licence.volunteer.contactId}`} className="text-indigo-600 hover:underline">
                      {licence.volunteer.contact.firstName} {licence.volunteer.contact.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono">{licence.licenceNumber || "—"}</td>
                  <td className="px-4 py-3">
                    {licence.expiryDate ? formatDate(licence.expiryDate) : "Not set"}
                    {expired && <Badge className="ml-2 bg-red-100 text-red-800">Expired</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {licence.verifiedAt ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        {formatDate(licence.verifiedAt)}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not verified</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!licence.verifiedAt && (
                      <form action={verifyLicence} className="inline">
                        <input type="hidden" name="licenceId" value={licence.id} />
                        <Button type="submit" size="sm" variant="outline">Verify</Button>
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
