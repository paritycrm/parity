import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Eye, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { formatDate } from "@/lib/utils";

export const metadata = {
  title: "Feedback Templates",
};

export default async function FeedbackTemplatesPage() {
  const session = await requireRole(["ADMIN", "STAFF"]);

  const templates = await prisma.feedbackTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { questions: true } },
    },
  });

  async function createTemplate(formData: FormData) {
    "use server";
    const s = await requireRole(["ADMIN", "STAFF"]);

    const name = formData.get("name") as string;
    const description = (formData.get("description") as string) || null;

    if (!name?.trim()) return;

    await prisma.feedbackTemplate.create({
      data: {
        name: name.trim(),
        description,
        createdById: s.id,
      },
    });

    revalidatePath("/settings/feedback-templates");
  }

  async function toggleActive(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "STAFF"]);

    const templateId = formData.get("templateId") as string;
    const currentActive = formData.get("currentActive") === "true";

    await prisma.feedbackTemplate.update({
      where: { id: templateId },
      data: { isActive: !currentActive },
    });

    revalidatePath("/settings/feedback-templates");
  }

  async function deleteTemplate(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "STAFF"]);

    const templateId = formData.get("templateId") as string;

    await prisma.feedbackTemplate.delete({
      where: { id: templateId },
    });

    revalidatePath("/settings/feedback-templates");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Feedback Templates</h1>
          <p className="text-gray-500 mt-1">
            Create feedback forms to collect volunteer feedback after events
          </p>
        </div>
      </div>

      {/* Create new template */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Create New Template</h2>
          <form action={createTemplate} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input name="name" required placeholder="Template name" label="Name" />
              <Input name="description" placeholder="Optional description" label="Description" />
            </div>
            <Button type="submit" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Create Template
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Templates list */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-gray-500">No feedback templates yet. Create one above to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Template Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Questions</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Created By</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Created</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {templates.map((template) => (
                    <tr key={template.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{template.name}</p>
                          {template.description && (
                            <p className="text-sm text-gray-500">{template.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="secondary">{template._count.questions} questions</Badge>
                      </td>
                      <td className="px-6 py-4">
                        {template.isActive ? (
                          <Badge className="bg-green-100 text-green-800">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {template.createdBy.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(template.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Link href={`/settings/feedback-templates/${template.id}`} title="View & edit questions">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <form action={toggleActive}>
                            <input type="hidden" name="templateId" value={template.id} />
                            <input type="hidden" name="currentActive" value={String(template.isActive)} />
                            <Button
                              variant="ghost"
                              size="sm"
                              type="submit"
                              title={template.isActive ? "Deactivate" : "Activate"}
                            >
                              {template.isActive ? (
                                <ToggleRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-gray-400" />
                              )}
                            </Button>
                          </form>
                          <form action={deleteTemplate}>
                            <input type="hidden" name="templateId" value={template.id} />
                            <ConfirmButton
                              message="Are you sure you want to delete this template? All questions and linked feedback will also be deleted."
                              variant="ghost"
                              size="sm"
                              title="Delete template"
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="h-4 w-4" />
                            </ConfirmButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
