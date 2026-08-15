import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm-button";

const questionTypeLabels: Record<string, string> = {
  TEXT: "Free Text",
  RATING: "Rating (1-5)",
  YES_NO: "Yes / No",
  MULTI_CHOICE: "Multiple Choice",
};

const questionTypeBadgeColors: Record<string, string> = {
  TEXT: "bg-blue-100 text-blue-800",
  RATING: "bg-amber-100 text-amber-800",
  YES_NO: "bg-green-100 text-green-800",
  MULTI_CHOICE: "bg-purple-100 text-purple-800",
};

export default async function FeedbackTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "STAFF"]);
  const { id } = await params;

  const template = await prisma.feedbackTemplate.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { name: true } },
    },
  });

  if (!template) redirect("/settings/feedback-templates");

  async function addQuestion(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "STAFF"]);

    const question = formData.get("question") as string;
    const type = formData.get("type") as string;
    const optionsRaw = (formData.get("options") as string) || "";
    const isRequired = formData.get("isRequired") === "on";
    const sortOrder = parseInt(formData.get("sortOrder") as string) || 0;

    if (!question?.trim()) return;

    // For MULTI_CHOICE, convert comma-separated options to JSON array
    let options: string | null = null;
    if (type === "MULTI_CHOICE" && optionsRaw.trim()) {
      const parsed = optionsRaw.split(",").map((o) => o.trim()).filter(Boolean);
      options = JSON.stringify(parsed);
    }

    await prisma.feedbackQuestion.create({
      data: {
        templateId: id,
        question: question.trim(),
        type,
        options,
        isRequired,
        sortOrder,
      },
    });

    revalidatePath(`/settings/feedback-templates/${id}`);
  }

  async function deleteQuestion(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "STAFF"]);

    const questionId = formData.get("questionId") as string;

    await prisma.feedbackQuestion.delete({
      where: { id: questionId },
    });

    revalidatePath(`/settings/feedback-templates/${id}`);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/feedback-templates" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
          {template.description && (
            <p className="text-sm text-gray-500">{template.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Created by {template.createdBy.name}
            {" "}
            {template.isActive ? (
              <Badge className="bg-green-100 text-green-800 ml-2">Active</Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">Inactive</Badge>
            )}
          </p>
        </div>
      </div>

      {/* Questions List */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">
            Questions ({template.questions.length})
          </h3>
        </CardHeader>
        <CardContent>
          {template.questions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              No questions added yet. Add your first question below.
            </p>
          ) : (
            <div className="space-y-3">
              {template.questions.map((q, index) => (
                <div
                  key={q.id}
                  className="flex items-start justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">#{q.sortOrder}</span>
                      <Badge className={questionTypeBadgeColors[q.type] || "bg-gray-100 text-gray-800"}>
                        {questionTypeLabels[q.type] || q.type}
                      </Badge>
                      {q.isRequired && (
                        <Badge className="bg-red-100 text-red-700">Required</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900">{q.question}</p>
                    {q.type === "MULTI_CHOICE" && q.options && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(JSON.parse(q.options) as string[]).map((opt, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <form action={deleteQuestion}>
                    <input type="hidden" name="questionId" value={q.id} />
                    <ConfirmButton
                      message="Delete this question? Any existing answers will also be deleted."
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Question Form */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Add Question</h3>
        </CardHeader>
        <CardContent>
          <form action={addQuestion} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
              <Textarea name="question" required placeholder="e.g. How would you rate your overall experience?" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  name="type"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="TEXT">Free Text</option>
                  <option value="RATING">Rating (1-5)</option>
                  <option value="YES_NO">Yes / No</option>
                  <option value="MULTI_CHOICE">Multiple Choice</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <Input
                  name="sortOrder"
                  type="number"
                  defaultValue={template.questions.length + 1}
                  min="0"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="isRequired"
                    defaultChecked={true}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Required
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Options (for Multiple Choice only, comma-separated)
              </label>
              <Input name="options" placeholder="e.g. Excellent, Good, Fair, Poor" />
            </div>

            <Button type="submit" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Question
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
