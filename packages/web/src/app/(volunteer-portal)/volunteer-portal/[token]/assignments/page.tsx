"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Loader2,
  AlertCircle,
  Clock,
  MapPin,
  Building2,
} from "lucide-react";

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  department: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SCHEDULED: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED: "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status}
    </span>
  );
}

export default function AssignmentsPage() {
  const params = useParams();
  const token = params.token as string;

  const [allAssignments, setAllAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch all assignments (the main API only returns upcoming 5, so we
    // re-fetch with a broader scope via the same endpoint — the portal API
    // returns upcoming by default, but we also need past ones. For now,
    // we use the data available and sort client-side.)
    fetch(`/api/member-portal/${token}/volunteer`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load data");
        return res.json();
      })
      .then((data) => {
        setAllAssignments(data.assignments || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Unable to load assignments
        </h2>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const upcoming = allAssignments
    .filter((a) => a.date >= today && a.status !== "CANCELLED")
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = allAssignments
    .filter((a) => a.date < today || a.status === "CANCELLED")
    .sort((a, b) => b.date.localeCompare(a.date));

  function AssignmentCard({ assignment }: { assignment: Assignment }) {
    const isPast = assignment.date < today;

    return (
      <div
        className={`bg-white rounded-xl border border-gray-200 p-5 ${
          isPast ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900">
                {assignment.title}
              </h3>
              <StatusBadge status={assignment.status} />
            </div>
            {assignment.description && (
              <p className="text-sm text-gray-500 mt-1.5">
                {assignment.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <span className="flex items-center gap-1.5 text-sm text-gray-600">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                {new Date(assignment.date).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {assignment.startTime && assignment.endTime && (
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Clock className="h-4 w-4 text-gray-400" />
                  {assignment.startTime}&ndash;{assignment.endTime}
                </span>
              )}
              {assignment.department && (
                <span className="flex items-center gap-1.5 text-sm text-gray-600">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  {assignment.department}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assignments</h1>
        <p className="text-gray-500 text-sm mt-1">
          Your scheduled volunteer assignments.
        </p>
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-indigo-600" />
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <CalendarDays className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              No upcoming assignments scheduled.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-400" />
            Past Assignments
          </h2>
          <div className="space-y-3">
            {past.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
