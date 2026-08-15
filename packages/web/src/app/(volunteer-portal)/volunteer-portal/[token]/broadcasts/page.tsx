"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  Radio,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Clock,
  MessageSquare,
  Send,
} from "lucide-react";

interface Broadcast {
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
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === "CRITICAL") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
        <AlertCircle className="h-3 w-3" />
        URGENT
      </span>
    );
  }
  if (urgency === "HIGH") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
        HIGH
      </span>
    );
  }
  return null;
}

function ResponseBadge({ response }: { response: string }) {
  const config: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    ACCEPTED: {
      icon: CheckCircle,
      color: "bg-green-100 text-green-700",
      label: "Accepted",
    },
    DECLINED: {
      icon: XCircle,
      color: "bg-red-100 text-red-700",
      label: "Declined",
    },
    TENTATIVE: {
      icon: HelpCircle,
      color: "bg-yellow-100 text-yellow-700",
      label: "Tentative",
    },
  };

  const c = config[response];
  if (!c) return null;
  const Icon = c.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${c.color}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {c.label}
    </span>
  );
}

export default function BroadcastsPage() {
  const params = useParams();
  const token = params.token as string;

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    fetch(`/api/member-portal/${token}/volunteer`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load data");
        return res.json();
      })
      .then((data) => setBroadcasts(data.broadcasts || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleRespond(broadcastId: string, response: string) {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/member-portal/${token}/volunteer/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            broadcastId,
            response,
            message: responseMessage || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to respond");
      }

      setSuccessId(broadcastId);
      setRespondingTo(null);
      setResponseMessage("");

      // Update local state
      setBroadcasts((prev) =>
        prev.map((b) =>
          b.id === broadcastId
            ? { ...b, myResponse: response, myMessage: responseMessage || null }
            : b
        )
      );

      setTimeout(() => setSuccessId(null), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error submitting response");
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
          Unable to load broadcasts
        </h2>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Broadcasts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Open broadcast requests from your organisation. Respond to let them
          know your availability.
        </p>
      </div>

      {broadcasts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Radio className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No open broadcasts
          </h3>
          <p className="text-sm text-gray-500">
            There are no broadcasts requiring your response right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {broadcasts.map((b) => (
            <div
              key={b.id}
              className={`bg-white rounded-xl border ${
                b.urgency === "CRITICAL"
                  ? "border-red-200"
                  : b.urgency === "HIGH"
                  ? "border-amber-200"
                  : "border-gray-200"
              } overflow-hidden`}
            >
              <div className="px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {b.title}
                      </h3>
                      <UrgencyBadge urgency={b.urgency} />
                      {b.myResponse && (
                        <ResponseBadge response={b.myResponse} />
                      )}
                    </div>
                    <p className="text-gray-600 text-sm mt-2">{b.message}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {b.targetDate}
                        {b.targetStartTime && b.targetEndTime && (
                          <span>
                            {" "}
                            &middot; {b.targetStartTime}&ndash;{b.targetEndTime}
                          </span>
                        )}
                      </span>
                      {b.department && <span>{b.department}</span>}
                      <span>Expires: {new Date(b.expiresAt).toLocaleDateString("en-GB")}</span>
                    </div>
                  </div>
                </div>

                {/* Success confirmation */}
                {successId === b.id && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    Response submitted successfully!
                  </div>
                )}

                {/* Response controls */}
                {b.myResponse ? (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-500">
                      You responded:{" "}
                      <span className="font-medium text-gray-700">
                        {b.myResponse}
                      </span>
                      {b.myMessage && (
                        <span className="italic"> &mdash; &ldquo;{b.myMessage}&rdquo;</span>
                      )}
                    </p>
                    <button
                      onClick={() => {
                        setRespondingTo(b.id);
                        setResponseMessage(b.myMessage || "");
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium mt-1"
                    >
                      Change response
                    </button>
                  </div>
                ) : (
                  !respondingTo || respondingTo !== b.id ? (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                      <button
                        onClick={() => handleRespond(b.id, "ACCEPTED")}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Accept
                      </button>
                      <button
                        onClick={() => handleRespond(b.id, "DECLINED")}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-red-600 border border-red-200 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Decline
                      </button>
                      <button
                        onClick={() => setRespondingTo(b.id)}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-yellow-600 border border-yellow-200 text-sm font-medium hover:bg-yellow-50 transition-colors disabled:opacity-50"
                      >
                        <HelpCircle className="h-4 w-4" />
                        Tentative
                      </button>
                      <button
                        onClick={() => setRespondingTo(b.id)}
                        className="text-sm text-gray-400 hover:text-gray-600 ml-2"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null
                )}

                {/* Message input (when responding with a message) */}
                {respondingTo === b.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Add a message (optional)
                      </label>
                      <textarea
                        value={responseMessage}
                        onChange={(e) => setResponseMessage(e.target.value)}
                        placeholder="e.g. I can arrive 15 minutes late..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRespond(b.id, "ACCEPTED")}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Accept
                      </button>
                      <button
                        onClick={() => handleRespond(b.id, "TENTATIVE")}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-yellow-600 border border-yellow-200 text-sm font-medium hover:bg-yellow-50 transition-colors disabled:opacity-50"
                      >
                        <HelpCircle className="h-4 w-4" />
                        Tentative
                      </button>
                      <button
                        onClick={() => handleRespond(b.id, "DECLINED")}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-red-600 border border-red-200 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Decline
                      </button>
                      <button
                        onClick={() => {
                          setRespondingTo(null);
                          setResponseMessage("");
                        }}
                        className="text-sm text-gray-400 hover:text-gray-600 ml-auto"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
