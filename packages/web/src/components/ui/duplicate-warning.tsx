// packages/web/src/components/ui/duplicate-warning.tsx

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ExternalLink, Users } from "lucide-react";

type MatchType = "EMAIL" | "NAME_POSTCODE" | "PHONE" | "NAME_SIMILAR";
type Confidence = "HIGH" | "MEDIUM" | "LOW";

interface DuplicateMatch {
  id: string;
  donorId: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  matchType: MatchType;
  confidence: Confidence;
}

interface DuplicateWarningProps {
  matches: DuplicateMatch[];
  onProceed: () => void;
  onCancel: () => void;
}

const matchTypeLabels: Record<MatchType, string> = {
  EMAIL: "Email match",
  NAME_POSTCODE: "Name + postcode",
  PHONE: "Phone match",
  NAME_SIMILAR: "Similar name",
};

const confidenceStyles: Record<Confidence, string> = {
  HIGH: "bg-red-100 text-red-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-gray-100 text-gray-600",
};

export function DuplicateWarning({
  matches,
  onProceed,
  onCancel,
}: DuplicateWarningProps) {
  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Potential duplicates found
            </h3>
            <p className="text-sm text-amber-700 mt-1">
              The following existing contacts may be duplicates. Please review
              before creating a new record.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {matches.map((match) => (
            <div
              key={match.id}
              className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Users className="h-4 w-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {match.firstName} {match.lastName}
                    {match.donorId != null && (
                      <span className="text-gray-500 font-normal ml-1">
                        #{match.donorId}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {[match.email, match.phone].filter(Boolean).join(" / ") ||
                      "No contact details"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-3">
                <Badge className={confidenceStyles[match.confidence]}>
                  {match.confidence}
                </Badge>
                <Badge variant="outline">{matchTypeLabels[match.matchType]}</Badge>
                <a
                  href={`/crm/contacts/${match.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  View
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onProceed}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Create Anyway
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
