import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ClipboardList, CheckCircle, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { completeOnboardingStep, startOnboarding } from "./actions";

const ONBOARDING_STEPS = [
  { key: "APPLICATION_RECEIVED", label: "Application Received" },
  { key: "DBS_SUBMITTED", label: "DBS Submitted" },
  { key: "DBS_CLEARED", label: "DBS Cleared" },
  { key: "INDUCTION", label: "Induction Completed" },
  { key: "TRAINING_ASSIGNED", label: "Training Assigned" },
  { key: "TRAINING_COMPLETED", label: "Training Completed" },
  { key: "FULLY_ONBOARDED", label: "Fully Onboarded" },
];

export default async function OnboardingPage() {
  const volunteers = await prisma.volunteerProfile.findMany({
    where: {
      OR: [
        { status: "APPLICANT" },
        { onboardingSteps: { some: {} } },
      ],
    },
    include: {
      contact: true,
      onboardingSteps: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const needsOnboarding = await prisma.volunteerProfile.findMany({
    where: {
      status: "APPLICANT",
      onboardingSteps: { none: {} },
    },
    include: { contact: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Volunteer Onboarding</h1>
          <p className="text-gray-500 mt-1">Track volunteer onboarding progress</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-gray-500">In Onboarding</p>
          <p className="text-2xl font-bold">{volunteers.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Awaiting Start</p>
          <p className="text-2xl font-bold text-yellow-600">{needsOnboarding.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">At DBS Stage</p>
          <p className="text-2xl font-bold text-blue-600">
            {volunteers.filter(v => {
              const steps = v.onboardingSteps;
              const hasAppReceived = steps.find(s => s.stepName === "APPLICATION_RECEIVED" && s.completedAt);
              const hasDbsCleared = steps.find(s => s.stepName === "DBS_CLEARED" && s.completedAt);
              return hasAppReceived && !hasDbsCleared;
            }).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Fully Onboarded</p>
          <p className="text-2xl font-bold text-green-600">
            {volunteers.filter(v => v.onboardingSteps.find(s => s.stepName === "FULLY_ONBOARDED" && s.completedAt)).length}
          </p>
        </Card>
      </div>

      {/* Needs onboarding started */}
      {needsOnboarding.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Awaiting Onboarding</h2>
          <div className="space-y-2">
            {needsOnboarding.map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div>
                  <Link href={`/crm/contacts/${v.contactId}`} className="font-medium text-indigo-600 hover:underline">
                    {v.contact.firstName} {v.contact.lastName}
                  </Link>
                  <p className="text-sm text-gray-500">Applied {formatDate(v.createdAt)}</p>
                </div>
                <form action={startOnboarding}>
                  <input type="hidden" name="volunteerId" value={v.id} />
                  <Button type="submit" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Start Onboarding
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Onboarding progress */}
      <div className="space-y-4">
        {volunteers.filter(v => v.onboardingSteps.length > 0).map(volunteer => {
          const steps = volunteer.onboardingSteps;
          return (
            <Card key={volunteer.id} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Link href={`/crm/contacts/${volunteer.contactId}`} className="font-semibold text-lg text-indigo-600 hover:underline">
                  {volunteer.contact.firstName} {volunteer.contact.lastName}
                </Link>
                <Badge className={
                  volunteer.status === "APPLICANT" ? "bg-yellow-100 text-yellow-800" :
                  volunteer.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                  "bg-gray-100 text-gray-800"
                }>{volunteer.status}</Badge>
              </div>

              {/* Progress steps */}
              <div className="space-y-2">
                {ONBOARDING_STEPS.map(step => {
                  const record = steps.find(s => s.stepName === step.key);
                  const isCompleted = record?.completedAt;
                  const isNext = !isCompleted && ONBOARDING_STEPS.findIndex(s => s.key === step.key) ===
                    ONBOARDING_STEPS.findIndex(s => !steps.find(r => r.stepName === s.key && r.completedAt));

                  return (
                    <div key={step.key} className={`flex items-center gap-3 p-2 rounded-lg ${
                      isCompleted ? "bg-green-50" : isNext ? "bg-indigo-50" : "bg-gray-50"
                    }`}>
                      {isCompleted ? (
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <Clock className={`h-5 w-5 flex-shrink-0 ${isNext ? "text-indigo-600" : "text-gray-300"}`} />
                      )}
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isCompleted ? "text-green-800" : isNext ? "text-indigo-800" : "text-gray-500"}`}>
                          {step.label}
                        </p>
                        {isCompleted && record?.completedAt && (
                          <p className="text-xs text-green-600">
                            Completed {formatDate(record.completedAt)}
                          </p>
                        )}
                      </div>
                      {isNext && (
                        <form action={completeOnboardingStep}>
                          <input type="hidden" name="volunteerId" value={volunteer.id} />
                          <input type="hidden" name="stepName" value={step.key} />
                          <Button type="submit" size="sm">Complete</Button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
