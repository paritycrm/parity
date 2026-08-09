import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FunderSelect } from "@/components/ui/funder-select";

export default async function NewGrantPage() {
  const funderOrgs = await prisma.organisation.findMany({
    where: { roleAssignments: { some: { role: { name: "Funder" } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  async function createGrant(formData: FormData) {
    "use server";
    const session = await requireAuth();

    const amountRequested = formData.get("amountRequested") as string;
    const applicationDeadline = formData.get("applicationDeadline") as string;
    const funderIdVal = (formData.get("funderId") as string) || null;

    const grant = await prisma.grant.create({
      data: {
        title: formData.get("title") as string,
        funderName: formData.get("funderName") as string,
        funderId: funderIdVal,
        type: (formData.get("type") as string) || "TRUST",
        status: "IDENTIFIED",
        amountRequested: amountRequested ? parseFloat(amountRequested) : null,
        applicationDeadline: applicationDeadline ? new Date(applicationDeadline) : null,
        description: (formData.get("description") as string) || null,
        purpose: (formData.get("purpose") as string) || null,
        contactPerson: (formData.get("contactPerson") as string) || null,
        contactEmail: (formData.get("contactEmail") as string) || null,
        reference: (formData.get("reference") as string) || null,
        notes: (formData.get("notes") as string) || null,
        isAnonymous: formData.get("isAnonymous") === "true",
        allowsPublicity: formData.get("allowsPublicity") === "true",
        createdById: session.id,
      },
    });

    revalidatePath("/finance/grants");
    redirect(`/finance/grants/${grant.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/grants" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Grant</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={createGrant} className="space-y-6">
            <Input
              label="Grant Title"
              name="title"
              placeholder="e.g. Community Development Fund 2024"
              required
            />
            <FunderSelect funderOrgs={funderOrgs} required />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Grant Type"
                name="type"
                defaultValue="TRUST"
                options={[
                  { value: "TRUST", label: "Trust" },
                  { value: "FOUNDATION", label: "Foundation" },
                  { value: "GOVERNMENT", label: "Government" },
                  { value: "CORPORATE", label: "Corporate" },
                  { value: "LOTTERY", label: "Lottery" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
              <Input
                label="Reference Number"
                name="reference"
                placeholder="Grant reference (optional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Amount Requested"
                name="amountRequested"
                type="number"
                step="0.01"
                placeholder="£0.00 (optional)"
              />
              <Input
                label="Application Deadline"
                name="applicationDeadline"
                type="date"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Contact Person"
                name="contactPerson"
                placeholder="Grant contact name (optional)"
              />
              <Input
                label="Contact Email"
                name="contactEmail"
                type="email"
                placeholder="contact@funder.org (optional)"
              />
            </div>

            <Input
              label="Description"
              name="description"
              placeholder="Brief description of the grant..."
            />

            <Input
              label="Purpose"
              name="purpose"
              placeholder="How the grant will be used..."
            />

            <Input
              label="Notes"
              name="notes"
              placeholder="Additional notes..."
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anonymous Funder</label>
                <select name="isAnonymous" defaultValue="false" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="false">No</option>
                  <option value="true">Yes — funder wishes to remain anonymous</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Allows Publicity</label>
                <select name="allowsPublicity" defaultValue="false" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Link href="/finance/grants">
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </Link>
              <Button type="submit">Create Grant</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
