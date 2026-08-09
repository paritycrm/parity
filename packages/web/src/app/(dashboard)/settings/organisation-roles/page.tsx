import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Tag } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";

export default async function OrganisationRolesPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/");

  const roles = await prisma.organisationRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: true } } },
  });

  // Ensure default system roles exist with distinct colours
  const systemRoles = [
    { name: "Supplier", colour: "#10b981" },
    { name: "Funder", colour: "#d97706" },
  ];
  for (const sr of systemRoles) {
    const exists = roles.find((r) => r.name === sr.name);
    if (!exists) {
      await prisma.organisationRole.create({
        data: { name: sr.name, colour: sr.colour, isSystem: true },
      });
    }
  }

  // Re-fetch after seeding
  const allRoles = await prisma.organisationRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: true } } },
  });

  async function addRole(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s || s.role !== "ADMIN") redirect("/");

    const name = (formData.get("name") as string).trim();
    const colour = (formData.get("colour") as string) || null;
    if (!name) return;

    const existing = await prisma.organisationRole.findUnique({ where: { name } });
    if (existing) return;

    await prisma.organisationRole.create({
      data: { name, colour },
    });
    revalidatePath("/settings/organisation-roles");
  }

  async function deleteRole(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s || s.role !== "ADMIN") redirect("/");

    const roleId = formData.get("roleId") as string;
    const role = await prisma.organisationRole.findUnique({ where: { id: roleId } });
    if (!role || role.isSystem) return; // can't delete system roles

    await prisma.organisationRole.delete({ where: { id: roleId } });
    revalidatePath("/settings/organisation-roles");
  }

  async function updateRoleColour(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s || s.role !== "ADMIN") redirect("/");

    const roleId = formData.get("roleId") as string;
    const colour = formData.get("colour") as string;
    await prisma.organisationRole.update({
      where: { id: roleId },
      data: { colour },
    });
    revalidatePath("/settings/organisation-roles");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organisation Roles</h1>
        <p className="text-gray-500 mt-1">
          Manage the roles that can be assigned to organisations (e.g. Supplier, Funder, Partner)
        </p>
      </div>

      {/* Add new role */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Role
          </h2>
        </CardHeader>
        <CardContent>
          <form action={addRole} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
              <Input name="name" required placeholder="e.g. Partner, Sponsor" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Badge Colour</label>
              <input
                name="colour"
                type="color"
                defaultValue="#6366f1"
                className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
              />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing roles */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Roles ({allRoles.length})
          </h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {allRoles.map((role) => (
              <div
                key={role.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: role.colour || "#6366f1" }}
                  >
                    {role.name}
                  </span>
                  <span className="text-sm text-gray-500">
                    {role._count.assignments} organisation{role._count.assignments !== 1 ? "s" : ""}
                  </span>
                  {role.isSystem && (
                    <span className="text-xs text-gray-400">(system)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <form action={updateRoleColour} className="flex items-center gap-2">
                    <input type="hidden" name="roleId" value={role.id} />
                    <input
                      name="colour"
                      type="color"
                      defaultValue={role.colour || "#6366f1"}
                      className="h-7 w-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Save
                    </Button>
                  </form>
                  {!role.isSystem && (
                    <form action={deleteRole}>
                      <input type="hidden" name="roleId" value={role.id} />
                      <ConfirmButton
                        message={`Delete the "${role.name}" role? It will be removed from all organisations.`}
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
