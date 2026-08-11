"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface EmailComposeFormProps {
  audienceType: string;
  eventTypeId: string;
  eventId: string;
  attendeeStatus: string;
  audienceCount: number;
  templates: { id: string; name: string }[];
  sendAction: (formData: FormData) => Promise<void>;
}

export function EmailComposeForm({
  audienceType,
  eventTypeId,
  eventId,
  attendeeStatus,
  audienceCount,
  templates,
  sendAction,
}: EmailComposeFormProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleTemplateChange(templateId: string) {
    if (!templateId) return;

    setLoadingTemplate(true);
    try {
      const res = await fetch(`/api/email-templates/${templateId}`);
      if (res.ok) {
        const template = await res.json();
        setSubject(template.subject || "");
        setBody(template.body || "");
      }
    } catch (error) {
      console.error("Failed to load template:", error);
    } finally {
      setLoadingTemplate(false);
    }
  }

  function handleSubmit(formData: FormData) {
    startTransition(() => {
      sendAction(formData);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="audienceType" value={audienceType} />
      <input type="hidden" name="eventTypeId" value={eventTypeId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="attendeeStatus" value={attendeeStatus} />

      {templates.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start from Template (optional)
          </label>
          <select
            onChange={(e) => handleTemplateChange(e.target.value)}
            disabled={loadingTemplate}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">Write from scratch</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {loadingTemplate && (
            <p className="text-xs text-gray-500 mt-1">Loading template...</p>
          )}
        </div>
      )}

      <Input
        label="Subject"
        name="subject"
        required
        placeholder="e.g. Upcoming 5K Run — Are you in?"
        value={subject}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
      />

      <Textarea
        label="Email Body"
        name="body"
        rows={8}
        required
        placeholder={`Hi {{name}},\n\nWe noticed you took part in a previous run event and wanted to let you know about an exciting new opportunity...\n\nBest wishes,\nThe Team`}
        value={body}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
      />

      <div className="flex items-center justify-between pt-2">
        <p className="text-sm text-gray-500">
          This will send to <strong>{audienceCount}</strong> recipient{audienceCount !== 1 ? "s" : ""}
        </p>
        <Button type="submit" disabled={isPending} className="flex items-center gap-2">
          <Send className="h-4 w-4" />
          {isPending ? "Sending..." : "Send Emails"}
        </Button>
      </div>
    </form>
  );
}
