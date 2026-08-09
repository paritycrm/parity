import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Building2, Plus, Edit3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ui/confirm-button";

export default async function OrganisationsPage() {
  const [organisations, availableRoles] = await Promise.all([
    prisma.organisation.findMany({
      include: {
        _count: { select: { contacts: true } },
        roleAssignments: { include: { role: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.organisationRole.findMany({ orderBy: { name: "asc" } }),
  ]);

  async function createOrg(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const roleIds = formData.getAll("roleIds") as string[];

    await prisma.organisation.create({
      data: {
        name: formData.get("name") as string,
        type: (formData.get("type") as string) || null,
        website: (formData.get("website") as string) || null,
        phone: (formData.get("phone") as string) || null,
        email: (formData.get("email") as string) || null,
        roleAssignments: {
          create: roleIds.map((roleId) => ({ roleId })),
        },
      },
    });
    revalidatePath("/crm/organisations");
    redirect("/crm/organisations");
  }

  async function updateOrg(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const orgId = formData.get("orgId") as string;
    const roleIds = formData.getAll("roleIds") as string[];

    await prisma.$transaction(async (tx) => {
      await tx.organisation.update({
        where: { id: orgId },
        data: {
          name: formData.get("name") as string,
          type: (formData.get("type") as string) || null,
          website: (formData.get("website") as string) || null,
          phone: (formData.get("phone") as string) || null,
          email: (formData.get("email") as string) || null,
        },
      });

      // Replace all role assignments
      await tx.organisationRoleAssignment.deleteMany({ where: { organisationId: orgId } });
      if (roleIds.length > 0) {
        await tx.organisationRoleAssignment.createMany({
          data: roleIds.map((roleId) => ({ organisationId: orgId, roleId })),
        });
      }
    });

    revalidatePath("/crm/organisations");
    redirect("/crm/organisations");
  }

  async function deleteOrg(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const orgId = formData.get("orgId") as string;
    await prisma.organisation.delete({ where: { id: orgId } });
    revalidatePath("/crm/organisations");
    redirect("/crm/organisations");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisations</h1>
          <p className="text-gray-500 mt-1">Manage organisations linked to your contacts</p>
        </div>
        <Link href="/settings/organisation-roles">
          <Button variant="outline" size="sm">Manage Roles</Button>
        </Link>
      </div>

      {/* Quick add form */}
      <Card className="p-4">
        <form action={createOrg} className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input name="name" required placeholder="Organisation name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select name="type" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select type</option>
                <option value="Corporate">Corporate</option>
                <option value="Foundation">Foundation</option>
                <option value="Government">Government</option>
                <option value="Charity">Charity</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input name="phone" placeholder="01..." className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input name="email" type="email" placeholder="info@..." className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <Button type="submit">
              <Plus className="h-4 w-4 mr-2" /> Add
            </Button>
          </div>
          {availableRoles.length > 0 && (
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs font-medium text-gray-500">Roles:</span>
              {availableRoles.map((role) => (
                <label key={role.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="roleIds"
                    value={role.id}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {role.name}
                </label>
              ))}
            </div>
          )}
        </form>
      </Card>

      {organisations.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organisations"
          description="Add organisations to link them to contacts."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {organisations.map((org) => (
            <Card key={org.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="rounded-full bg-gray-100 p-2 flex-shrink-0">
                    <Building2 className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{org.name}</h3>
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
                    {org.type && <p className="text-sm text-gray-500">{org.type}</p>}
                    <p className="text-sm text-gray-400 mt-1">
                      {org._count.contacts} contact{org._count.contacts !== 1 ? "s" : ""}
                      {org.phone && ` · ${org.phone}`}
                      {org.email && ` · ${org.email}`}
                    </p>
                    {org.website && (
                      <a href={org.website} target="_blank" rel="noopener" className="text-sm text-indigo-600 hover:underline mt-1 block">
                        {org.website}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <form action={deleteOrg} className="inline">
                    <input type="hidden" name="orgId" value={org.id} />
                    <ConfirmButton message={`Are you sure you want to delete "${org.name}"? This action cannot be undone.`} variant="destructive" size="sm" className="gap-2">
                      <Trash2 className="h-4 w-4" /> Delete
                    </ConfirmButton>
                  </form>
                </div>
              </div>

              {/* Inline Edit Form */}
              <details className="mt-4 border-t border-gray-100 pt-4">
                <summary className="cursor-pointer text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                  <Edit3 className="h-4 w-4" /> Edit Organisation
                </summary>
                <form action={updateOrg} className="space-y-3 mt-3">
                  <input type="hidden" name="orgId" value={org.id} />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                      <Input name="name" required defaultValue={org.name} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                      <select name="type" defaultValue={org.type || ""} className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full">
                        <option value="">Select type</option>
                        <option value="Corporate">Corporate</option>
                        <option value="Foundation">Foundation</option>
                        <option value="Government">Government</option>
                        <option value="Charity">Charity</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Website</label>
                      <Input name="website" defaultValue={org.website || ""} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                      <Input name="phone" defaultValue={org.phone || ""} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                      <Input name="email" type="email" defaultValue={org.email || ""} />
                    </div>
                  </div>
                  {availableRoles.length > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-500">Roles:</span>
                      {availableRoles.map((role) => (
                        <label key={role.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            name="roleIds"
                            value={role.id}
                            defaultChecked={org.roleAssignments.some((ra) => ra.roleId === role.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {role.name}
                        </label>
                      ))}
                    </div>
                  )}
                  <Button type="submit" size="sm">Save Changes</Button>
                </form>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
