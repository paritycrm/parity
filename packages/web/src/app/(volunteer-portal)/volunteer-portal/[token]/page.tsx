"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  User,
  CalendarDays,
  Clock,
  Radio,
  CheckCircle,
  AlertCircle,
  Loader2,
  Building2,
  Wrench,
} from "lucide-react";

interface VolunteerData {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  volunteer: {
    id: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    desiredHoursPerWeek: number | null;
    departments: { id: string; name: string }[];
    skills: { id: string; name: string }[];
  };
  assignments: {
    id: string;
    title: string;
    description: string | null;
    date: string;
    startTime: string | null;
    endTime: string | null;
    status: string;
    department: string | null;
  }[];
  broadcasts: {
    id: string;
    title: string;
    message: string;
    urgency: string;
    targetDate: string;
    targetStartTime: string | null;
    targetEndTime: string | null;
    department: string | null;
    maxRespondents: number;
    expiresAt: string;
    myResponse: string | null;
    myMessage: string | null;
  }[];
  hoursLogs: {
    id: string;
    date: string;
    hours: number;
    description: string | null;
    status: string;
    department: string | null;
  }[];
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    INACTIVE: "bg-gray-100 text-gray-800",
    ON_LEAVE: "bg-yellow-100 text-yellow-800",
    APPLICANT: "bg-blue-100 text-blue-800",
    DEPARTED: "bg-red-100 text-red-800",
    SCHEDULED: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED: "bg-gray-100 text-gray-500",
    LOGGED: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-blue-100 text-blue-800",
    VERIFIED: "bg-green-100 text-green-800",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default function VolunteerPortalOverview() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<VolunteerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/member-portal/${token}/volunteer`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load volunteer data");
        return res.json();
      })
      .then(setData)
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

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Unable to load portal
        </h2>
        <p className="text-gray-500 text-sm">
          {error || "The link may be invalid or expired. Please contact us."}
        </p>
      </div>
    );
  }

  const { contact, volunteer, assignments, broadcasts, hoursLogs } = data;
  const activeBroadcasts = broadcasts.filter((b) => !b.myResponse);
  const totalHours = hoursLogs.reduce((sum, h) => sum + h.hours, 0);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xl font-bold">
              {contact.firstName[0]}
              {contact.lastName[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome, {contact.firstName}!
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Volunteer since{" "}
                {volunteer.startDate
                  ? new Date(volunteer.startDate).toLocaleDateString("en-GB")
                  : "N/A"}
              </p>
            </div>
          </div>
          <StatusBadge status={volunteer.status} />
        </div>

        {/* Departments and Skills */}
        <div className="mt-6 flex flex-wrap gap-6">
          {volunteer.departments.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                <Building2 className="h-3.5 w-3.5" />
                Departments
              </div>
              <div className="flex flex-wrap gap-1.5">
                {volunteer.departments.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700"
                  >
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {volunteer.skills.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                <Wrench className="h-3.5 w-3.5" />
                Skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {volunteer.skills.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {assignments.length}
              </p>
              <p className="text-xs text-gray-500">Upcoming assignments</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <Radio className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {activeBroadcasts.length}
              </p>
              <p className="text-xs text-gray-500">Open broadcasts</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Clock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {totalHours.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500">Hours logged</p>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Assignments */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
            Upcoming Assignments
          </h2>
        </div>
        {assignments.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No upcoming assignments scheduled.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {assignments.map((a) => (
              <li key={a.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{a.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {new Date(a.date).toLocaleDateString("en-GB")}
                      {a.startTime && a.endTime && (
                        <span>
                          {" "}
                          &middot; {a.startTime}&ndash;{a.endTime}
                        </span>
                      )}
                      {a.department && (
                        <span> &middot; {a.department}</span>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active Broadcasts */}
      {activeBroadcasts.length > 0 && (
        <div className="bg-white rounded-xl border border-orange-200">
          <div className="px-6 py-4 border-b border-orange-100 bg-orange-50 rounded-t-xl">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Radio className="h-5 w-5 text-orange-600" />
              Open Broadcasts &mdash; Response Needed
            </h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {activeBroadcasts.map((b) => (
              <li key={b.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{b.title}</p>
                      {b.urgency === "CRITICAL" && (
                        <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          URGENT
                        </span>
                      )}
                      {b.urgency === "HIGH" && (
                        <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          HIGH
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{b.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {b.targetDate}
                      {b.targetStartTime && b.targetEndTime && (
                        <span>
                          {" "}
                          &middot; {b.targetStartTime}&ndash;
                          {b.targetEndTime}
                        </span>
                      )}
                      {b.department && (
                        <span> &middot; {b.department}</span>
                      )}
                    </p>
                  </div>
                  <a
                    href={`/volunteer-portal/${token}/broadcasts`}
                    className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Respond &rarr;
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Hours */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            Recent Hours
          </h2>
        </div>
        {hoursLogs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No hours logged yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {hoursLogs.map((h) => (
                  <tr key={h.id}>
                    <td className="px-6 py-3 text-sm text-gray-900">
                      {new Date(h.date).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                      {h.hours}h
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {h.description || "—"}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={h.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
