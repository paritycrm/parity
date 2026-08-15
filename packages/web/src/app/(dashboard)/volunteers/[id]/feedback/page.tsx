import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Star, MessageSquare, Calendar, CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-600",
};

const statusIcons: Record<string, typeof CheckCircle2> = {
  PENDING: Clock,
  COMPLETED: CheckCircle2,
  EXPIRED: XCircle,
};

export default async function VolunteerFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "STAFF"]);
  const { id } = await params;

  const volunteer = await prisma.volunteerProfile.findUnique({
    where: { id },
    include: {
      contact: { select: { firstName: true, lastName: true } },
    },
  });

  if (!volunteer) notFound();

  const feedbackRequests = await prisma.feedbackRequest.findMany({
    where: { volunteerId: id },
    orderBy: { createdAt: "desc" },
    include: {
      template: { select: { name: true } },
      event: { select: { id: true, name: true } },
      answers: {
        include: {
          question: { select: { question: true, type: true, sortOrder: true } },
        },
        orderBy: { question: { sortOrder: "asc" } },
      },
    },
  });

  // Group by event for display
  const withEvent = feedbackRequests.filter((r) => r.event);
  const withoutEvent = feedbackRequests.filter((r) => !r.event);

  // Group by event
  const eventGroups = new Map<string, { eventName: string; requests: typeof feedbackRequests }>();
  for (const req of withEvent) {
    const eventId = req.event!.id;
    if (!eventGroups.has(eventId)) {
      eventGroups.set(eventId, { eventName: req.event!.name, requests: [] });
    }
    eventGroups.get(eventId)!.requests.push(req);
  }

  function renderRating(rating: number | null) {
    if (rating === null) return null;
    return (
      <span className="inline-flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i < rating ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}
          />
        ))}
        <span className="text-sm text-gray-500 ml-1">{rating}/5</span>
      </span>
    );
  }

  function renderAnswer(answer: { answer: string; rating: number | null; question: { question: string; type: string; sortOrder: number } }) {
    return (
      <div key={answer.question.question} className="py-2">
        <p className="text-xs font-medium text-gray-500 mb-1">{answer.question.question}</p>
        {answer.question.type === "RATING" ? (
          renderRating(answer.rating)
        ) : (
          <p className="text-sm text-gray-900">{answer.answer || <span className="text-gray-400 italic">No answer</span>}</p>
        )}
      </div>
    );
  }

  function renderFeedbackRequest(req: typeof feedbackRequests[number]) {
    const StatusIcon = statusIcons[req.status] || Clock;

    return (
      <div key={req.id} className="border border-gray-100 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-900">{req.template.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusColors[req.status] || "bg-gray-100 text-gray-800"}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {req.status}
            </Badge>
            <span className="text-xs text-gray-400">{formatDate(req.createdAt)}</span>
          </div>
        </div>

        {req.status === "COMPLETED" && req.answers.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {req.answers.map((a) => renderAnswer(a))}
          </div>
        ) : req.status === "PENDING" ? (
          <p className="text-sm text-gray-500 italic">Awaiting response</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No responses received</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/volunteers/${id}`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Feedback for {volunteer.contact.firstName} {volunteer.contact.lastName}
          </h1>
          <p className="text-sm text-gray-500">
            {feedbackRequests.length} feedback request{feedbackRequests.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {feedbackRequests.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No feedback requests sent to this volunteer yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Event-linked feedback */}
          {Array.from(eventGroups.entries()).map(([eventId, group]) => (
            <Card key={eventId}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-900">{group.eventName}</h3>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.requests.map(renderFeedbackRequest)}
              </CardContent>
            </Card>
          ))}

          {/* Non-event feedback */}
          {withoutEvent.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">General Feedback</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                {withoutEvent.map(renderFeedbackRequest)}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="flex justify-end">
        <Link href={`/volunteers/${id}`}>
          <Button variant="outline">Back to Profile</Button>
        </Link>
      </div>
    </div>
  );
}
