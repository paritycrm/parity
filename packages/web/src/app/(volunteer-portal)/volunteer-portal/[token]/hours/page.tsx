"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  Clock,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface HoursLog {
  id: string;
  date: string;
  hours: number;
  description: string | null;
  status: string;
  department: string | null;
}

interface Department {
  id: string;
  name: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
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
      {status}
    </span>
  );
}

export default function HoursPage() {
  const params = useParams();
  const token = params.token as string;

  const [hoursLogs, setHoursLogs] = useState<HoursLog[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formDate, setFormDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [formHours, setFormHours] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    fetch(`/api/member-portal/${token}/volunteer`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load data");
        return res.json();
      })
      .then((data) => {
        setHoursLogs(data.hoursLogs || []);
        setDepartments(data.volunteer?.departments || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setSuccess(false);

    try {
      const res = await fetch(
        `/api/member-portal/${token}/volunteer/hours`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: formDate,
            hours: parseFloat(formHours),
            description: formDescription || undefined,
            departmentId: formDepartmentId || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to log hours");
      }

      const data = await res.json();

      // Add to local state
      setHoursLogs((prev) => [
        {
          id: data.hoursLog.id,
          date: data.hoursLog.date,
          hours: data.hoursLog.hours,
          description: data.hoursLog.description,
          status: data.hoursLog.status,
          department:
            departments.find((d) => d.id === formDepartmentId)?.name || null,
        },
        ...prev,
      ]);

      // Reset form
      setFormHours("");
      setFormDescription("");
      setFormDepartmentId("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Error logging hours"
      );
    } finally {
      setSubmitting(false);
    }
  }

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
          Unable to load hours
        </h2>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  const totalHours = hoursLogs.reduce((sum, h) => sum + h.hours, 0);
  const verifiedHours = hoursLogs
    .filter((h) => h.status === "VERIFIED")
    .reduce((sum, h) => sum + h.hours, 0);
  const pendingHours = hoursLogs
    .filter((h) => h.status === "LOGGED")
    .reduce((sum, h) => sum + h.hours, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Hours</h1>
        <p className="text-gray-500 text-sm mt-1">
          Log your volunteer hours and track their approval status.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total Hours
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {totalHours.toFixed(1)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-5">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">
            Verified
          </p>
          <p className="text-3xl font-bold text-green-700 mt-1">
            {verifiedHours.toFixed(1)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-200 p-5">
          <p className="text-xs font-medium text-yellow-600 uppercase tracking-wide">
            Pending Review
          </p>
          <p className="text-3xl font-bold text-yellow-700 mt-1">
            {pendingHours.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Log hours form */}
      <div className="bg-white rounded-xl border border-indigo-200">
        <div className="px-6 py-4 border-b border-indigo-100 bg-indigo-50 rounded-t-xl">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Plus className="h-5 w-5 text-indigo-600" />
            Log Hours
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                max={new Date().toISOString().split("T")[0]}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hours
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={formHours}
                onChange={(e) => setFormHours(e.target.value)}
                required
                placeholder="e.g. 3.5"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department (optional)
              </label>
              <select
                value={formDepartmentId}
                onChange={(e) => setFormDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select department...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Kitchen prep and serving"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {formError}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              Hours logged successfully!
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Log Hours
          </button>
        </form>
      </div>

      {/* Hours list */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            Hours Log
          </h2>
        </div>
        {hoursLogs.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No hours logged yet. Use the form above to get started.
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
                    Department
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
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-900">
                      {new Date(h.date).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                      {h.hours}h
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {h.department || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 max-w-xs truncate">
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
