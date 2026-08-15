import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const feedbackRequest = await prisma.feedbackRequest.findUnique({
    where: { token },
    include: {
      template: {
        include: {
          questions: { orderBy: { sortOrder: "asc" } },
        },
      },
      volunteer: {
        include: {
          contact: { select: { firstName: true, lastName: true } },
        },
      },
      event: { select: { id: true, name: true } },
      answers: true,
    },
  });

  if (!feedbackRequest) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Feedback Link Not Found</h2>
          <p className="text-gray-500">
            This feedback link is invalid or has been removed.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Check if already completed
  if (feedbackRequest.status === "COMPLETED") {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-500">
            Your feedback has already been submitted. We appreciate your time.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Check if expired
  if (feedbackRequest.expiresAt && feedbackRequest.expiresAt < new Date()) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <Clock className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h2>
          <p className="text-gray-500">
            This feedback link has expired. Please contact us if you would still like to share your feedback.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { template, volunteer } = feedbackRequest;

  async function submitFeedback(formData: FormData) {
    "use server";

    const req = await prisma.feedbackRequest.findUnique({
      where: { token },
      include: {
        template: {
          include: { questions: true },
        },
      },
    });

    if (!req || req.status === "COMPLETED") return;
    if (req.expiresAt && req.expiresAt < new Date()) return;

    const questions = req.template.questions;

    // Create answers for each question
    const answerData = questions.map((q) => {
      const rawAnswer = formData.get(`question_${q.id}`) as string;
      const answer = rawAnswer || "";
      const rating = q.type === "RATING" ? parseInt(answer) || null : null;

      return {
        requestId: req.id,
        questionId: q.id,
        answer,
        rating,
      };
    });

    // Filter out empty non-required answers, keep required ones even if empty
    const filteredAnswers = answerData.filter((a) => {
      const question = questions.find((q) => q.id === a.questionId);
      return a.answer || question?.isRequired;
    });

    if (filteredAnswers.length > 0) {
      await prisma.feedbackAnswer.createMany({
        data: filteredAnswers,
      });
    }

    // Mark request as completed
    await prisma.feedbackRequest.update({
      where: { id: req.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    revalidatePath(`/feedback/${token}`);
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Hi {volunteer.contact.firstName}, we'd love your feedback!
        </h1>
        <p className="text-gray-500 mt-1">
          {template.name}
          {feedbackRequest.event && (
            <span> &mdash; {feedbackRequest.event.name}</span>
          )}
        </p>
        {template.description && (
          <p className="text-sm text-gray-400 mt-1">{template.description}</p>
        )}
      </div>

      {/* Feedback Form */}
      <Card>
        <CardContent className="pt-6">
          <form action={submitFeedback} className="space-y-6">
            {template.questions.map((q, index) => (
              <div key={q.id} className="space-y-2">
                <label className="block text-sm font-medium text-gray-900">
                  {index + 1}. {q.question}
                  {q.isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>

                {/* TEXT type */}
                {q.type === "TEXT" && (
                  <textarea
                    name={`question_${q.id}`}
                    required={q.isRequired}
                    rows={3}
                    placeholder="Type your answer here..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3a2d]/50 focus:border-[#1b3a2d]"
                  />
                )}

                {/* RATING type */}
                {q.type === "RATING" && (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <label
                        key={val}
                        className="flex flex-col items-center cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`question_${q.id}`}
                          value={val}
                          required={q.isRequired}
                          className="sr-only peer"
                        />
                        <span className="w-12 h-12 rounded-lg border-2 border-gray-200 flex items-center justify-center text-lg font-bold text-gray-400 peer-checked:border-[#1b3a2d] peer-checked:bg-[#1b3a2d]/10 peer-checked:text-[#1b3a2d] hover:border-gray-400 transition-colors">
                          {val}
                        </span>
                        <span className="text-xs text-gray-400 mt-1">
                          {val === 1 ? "Poor" : val === 5 ? "Great" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* YES_NO type */}
                {q.type === "YES_NO" && (
                  <div className="flex gap-4">
                    {["Yes", "No"].map((opt) => (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`question_${q.id}`}
                          value={opt}
                          required={q.isRequired}
                          className="text-[#1b3a2d] focus:ring-[#1b3a2d]"
                        />
                        <span className="text-sm text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* MULTI_CHOICE type */}
                {q.type === "MULTI_CHOICE" && q.options && (
                  <div className="space-y-2">
                    {(JSON.parse(q.options) as string[]).map((opt) => (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`question_${q.id}`}
                          value={opt}
                          required={q.isRequired}
                          className="text-[#1b3a2d] focus:ring-[#1b3a2d]"
                        />
                        <span className="text-sm text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="pt-4 border-t border-gray-100">
              <Button
                type="submit"
                className="w-full bg-[#1b3a2d] hover:bg-[#152e23] text-white"
              >
                Submit Feedback
              </Button>
              <p className="text-xs text-gray-400 text-center mt-2">
                Your responses help us improve. Thank you for volunteering with us!
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
