import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Edit3,
  Trash2,
  Users,
  PoundSterling,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { RoleMultiSelect } from "@/components/ui/role-multi-select";
import { formatDate } from "@/lib/utils";

export default async function OrganisationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [org, availableRoles, donationAgg, recentDonations] = await Promise.all([
    prisma.organisation.findUnique({
      where: { id },
      include: {
        parent: true,
        roleAssignments: { include: { role: true } },
        contacts: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            types: true,
          },
          orderBy: { firstName: "asc" },
        },
        grants: {
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.organisationRole.findMany({ orderBy: { name: "asc" } }),
    prisma.donation.aggregate({
      where: { contact: { organisationId: id } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.donation.findMany({
      where: { contact: { organisationId: id } },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { date: "desc" },
      take: 10,
    }),
  ]);

  if (!org) notFound();

  // ── Server Actions ──────────────────────────────────────────

  async function updateOrganisation(formData: FormData) {
    "use server";
    await requireAuth();

    const roleIds = formData.getAll("roleIds") as string[];

    await prisma.$transaction(async (tx) => {
      await tx.organisation.update({
        where: { id },
        data: {
          name: formData.get("name") as string,
          type: (formData.get("type") as string) || null,
          website: (formData.get("website") as string) || null,
          phone: (formData.get("phone") as string) || null,
          email: (formData.get("email") as string) || null,
          addressLine1: (formData.get("addressLine1") as string) || null,
          addressLine2: (formData.get("addressLine2") as string) || null,
          city: (formData.get("city") as string) || null,
          postcode: (formData.get("postcode") as string) || null,
          country: (formData.get("country") as string) || null,
        },
      });

      // Replace all role assignments
      await tx.organisationRoleAssignment.deleteMany({
        where: { organisationId: id },
      });
      if (roleIds.length > 0) {
        await tx.organisationRoleAssignment.createMany({
          data: roleIds.map((roleId) => ({ organisationId: id, roleId })),
        });
      }
    });

    revalidatePath(`/crm/organisations/${id}`);
    redirect(`/crm/organisations/${id}`);
  }

  async function deleteOrganisation() {
    "use server";
    await requireAuth();

    await prisma.organisation.delete({ where: { id } });
    revalidatePath("/crm/organisations");
    redirect("/crm/organisations");
  }

  // ── Computed Values ─────────────────────────────────────────

  const totalDonated = Number(donationAgg._sum.amount ?? 0);
  const donationCount = donationAgg._count;

  const addressParts = [
    org.addressLine1,
    org.addressLine2,
    org.city,
    org.postcode,
    org.country,
  ].filter(Boolean);

  const typeColors: Record<string, string> = {
    DONOR: "bg-green-100 text-green-800",
    VOLUNTEER: "bg-indigo-100 text-indigo-800",
  };

  const grantStatusColors: Record<string, string> = {
    IDENTIFIED: "bg-gray-100 text-gray-800",
    RESEARCHING: "bg-blue-100 text-blue-800",
    APPLYING: "bg-indigo-100 text-indigo-800",
    SUBMITTED: "bg-yellow-100 text-yellow-800",
    SUCCESSFUL: "bg-green-100 text-green-800",
    UNSUCCESSFUL: "bg-red-100 text-red-800",
    REPORTING: "bg-purple-100 text-purple-800",
    COMPLETED: "bg-emerald-100 text-emerald-800",
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link + page title */}
      <div className="flex items-center gap-4">
        <Link href="/crm/organisations" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Organisation Details</h1>
      </div>

      {/* ── Header Card ────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-gray-100 p-3 flex-shrink-0">
              <Building2 className="h-6 w-6 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{org.name}</h2>

                  {/* Type + role badges */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {org.type && (
                      <Badge variant="outline">{org.type}</Badge>
                    )}
                    {org.roleAssignments.map((ra) => (
                      <span
                        key={ra.roleId}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: ra.role.colour || "#6366f1" }}
                      >
                        {ra.role.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 flex-shrink-0">
                  <form action={deleteOrganisation}>
                    <ConfirmButton
                      message={`Are you sure you want to delete "${org.name}"? This will unlink all contacts but not delete them. This action cannot be undone.`}
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </ConfirmButton>
                  </form>
                </div>
              </div>

              {/* Contact details */}
              <div className="mt-3 space-y-1.5">
                {org.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4" /> {org.email}
                  </div>
                )}
                {org.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" /> {org.phone}
                  </div>
                )}
                {addressParts.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>{addressParts.join(", ")}</span>
                  </div>
                )}
                {org.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-gray-600" />
                    <a
                      href={org.website.startsWith("http") ? org.website : `https://${org.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      {org.website}
                    </a>
                  </div>
                )}
                {org.parent && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Building2 className="h-4 w-4" />
                    <span>Parent:</span>
                    <Link
                      href={`/crm/organisations/${org.parent.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {org.parent.name}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Edit Form (collapsible) ────────────────────────────── */}
      <Card>
        <details>
          <summary className="cursor-pointer px-6 py-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2">
            <Edit3 className="h-4 w-4" /> Edit Organisation
          </summary>
          <CardContent className="pt-0">
            <form action={updateOrganisation} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <Input name="name" required defaultValue={org.name} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    name="type"
                    defaultValue={org.type || ""}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select type</option>
                    <option value="Charity">Charity</option>
                    <option value="Corporate">Corporate</option>
                    <option value="Trust">Trust</option>
                    <option value="Foundation">Foundation</option>
                    <option value="Government">Government</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <Input name="website" defaultValue={org.website || ""} placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <Input name="phone" defaultValue={org.phone || ""} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <Input name="email" type="email" defaultValue={org.email || ""} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                  <Input name="addressLine1" defaultValue={org.addressLine1 || ""} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                  <Input name="addressLine2" defaultValue={org.addressLine2 || ""} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <Input name="city" defaultValue={org.city || ""} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                  <Input name="postcode" defaultValue={org.postcode || ""} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <Input name="country" defaultValue={org.country || ""} />
                </div>
              </div>

              {availableRoles.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Roles</label>
                  <RoleMultiSelect
                    roles={availableRoles}
                    selectedIds={org.roleAssignments.map((ra) => ra.roleId)}
                  />
                </div>
              )}

              <Button type="submit">Save Changes</Button>
            </form>
          </CardContent>
        </details>
      </Card>

      {/* ── Linked Contacts ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Linked Contacts ({org.contacts.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          {org.contacts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No contacts linked to this organisation.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Name</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Email</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Phone</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Types</th>
                  </tr>
                </thead>
                <tbody>
                  {org.contacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-2">
                        <Link
                          href={`/crm/contacts/${contact.id}`}
                          className="text-indigo-600 hover:underline font-medium"
                        >
                          {contact.firstName} {contact.lastName}
                        </Link>
                      </td>
                      <td className="py-3 px-2 text-gray-600">{contact.email || "—"}</td>
                      <td className="py-3 px-2 text-gray-600">{contact.phone || "—"}</td>
                      <td className="py-3 px-2">
                        <div className="flex gap-1 flex-wrap">
                          {contact.types.length > 0 ? (
                            contact.types.map((t) => (
                              <Badge
                                key={t}
                                className={`text-xs ${
                                  typeColors[t] || "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {t}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-gray-400">{"—"}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Donation History ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <PoundSterling className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Donation History</h3>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-800">
                {"£"}
                {totalDonated.toLocaleString("en-GB", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-sm text-green-600 mt-1">Total Donated</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-800">{donationCount}</p>
              <p className="text-sm text-green-600 mt-1">
                Donation{donationCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Recent donations table */}
          {recentDonations.length > 0 ? (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Donations</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Contact</th>
                      <th className="text-right py-3 px-2 font-medium text-gray-500">Amount</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDonations.map((d) => (
                      <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3 px-2 text-gray-600">{formatDate(d.date)}</td>
                        <td className="py-3 px-2">
                          <Link
                            href={`/crm/contacts/${d.contact.id}`}
                            className="text-indigo-600 hover:underline"
                          >
                            {d.contact.firstName} {d.contact.lastName}
                          </Link>
                        </td>
                        <td className="py-3 px-2 text-right font-semibold text-gray-900">
                          {"£"}
                          {Number(d.amount).toLocaleString("en-GB", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-2">
                          <Badge variant="outline" className="text-xs">
                            {d.type}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              No donations from contacts in this organisation.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Grants ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Grants ({org.grants.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          {org.grants.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No grants from this organisation.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Grant</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">Requested</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-500">Awarded</th>
                  </tr>
                </thead>
                <tbody>
                  {org.grants.map((grant) => (
                    <tr key={grant.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-2">
                        <Link
                          href={`/finance/grants/${grant.id}`}
                          className="text-indigo-600 hover:underline font-medium"
                        >
                          {grant.title}
                        </Link>
                      </td>
                      <td className="py-3 px-2">
                        <Badge
                          className={`text-xs ${
                            grantStatusColors[grant.status] || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {grant.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right text-gray-600">
                        {grant.amountRequested
                          ? `£${Number(grant.amountRequested).toLocaleString("en-GB", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : "—"}
                      </td>
                      <td className="py-3 px-2 text-right font-semibold text-gray-900">
                        {grant.amountAwarded
                          ? `£${Number(grant.amountAwarded).toLocaleString("en-GB", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
