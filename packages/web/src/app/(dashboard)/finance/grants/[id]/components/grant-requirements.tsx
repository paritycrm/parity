"use client";

import { useState, useTransition } from "react";
import { Plus, CheckCircle2, Clock, AlertTriangle, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
}

interface Requirement {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: string;
  completedAt: string | null;
  attachments: Attachment[];
}

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  PENDING: { icon: Clock, color: "bg-gray-100 text-gray-700", label: "Pending" },
  IN_PROGRESS: { icon: AlertTriangle, color: "bg-yellow-100 text-yellow-700", label: "In Progress" },
  SUBMITTED: { icon: Upload, color: "bg-blue-100 text-blue-700", label: "Submitted" },
  COMPLETE: { icon: CheckCircle2, color: "bg-green-100 text-green-700", label: "Complete" },
};

export function GrantRequirements({
  requirements,
  grantId,
  addAction,
  updateStatusAction,
  deleteAction,
  uploadAttachmentAction,
}: {
  requirements: Requirement[];
  grantId: string;
  addAction: (formData: FormData) => Promise<void>;
  updateStatusAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const overdue = requirements.filter(
    (r) => r.status !== "COMPLETE" && new Date(r.dueDate) < new Date()
  );

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("grantId", grantId);
    startTransition(() => addAction(formData));
    setShowForm(false);
  }

  async function handleFileUpload(requirementId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Upload to API first
    const apiForm = new FormData();
    apiForm.append("file", file);
    const res = await fetch("/api/grants/documents", { method: "POST", body: apiForm });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || "Upload failed");
      return;
    }

    const formData = new FormData();
    formData.set("requirementId", requirementId);
    formData.set("fileName", data.fileName);
    formData.set("fileType", data.fileType);
    formData.set("fileSize", String(data.fileSize));
    formData.set("fileData", data.fileData);

    startTransition(() => uploadAttachmentAction(formData));
    e.target.value = "";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Reporting Requirements</h3>
          {overdue.length > 0 && (
            <p className="text-xs text-red-600 mt-0.5">{overdue.length} overdue</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Requirement
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="p-4 border border-gray-200 rounded-lg space-y-3 bg-gray-50">
          <Input label="Title *" name="title" required placeholder="e.g. Provide payslips for Q1" />
          <Input label="Description" name="description" placeholder="Details of what's required..." />
          <Input label="Due Date *" name="dueDate" type="date" required />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>Save</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {requirements.length === 0 && !showForm ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No reporting requirements. Add deliverables the grant funder requires.
        </p>
      ) : (
        <div className="space-y-3">
          {requirements.map((req) => {
            const config = statusConfig[req.status] || statusConfig.PENDING;
            const Icon = config.icon;
            const isOverdue = req.status !== "COMPLETE" && new Date(req.dueDate) < new Date();

            return (
              <div
                key={req.id}
                className={`p-4 rounded-lg border ${
                  isOverdue ? "border-red-300 bg-red-50" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${isOverdue ? "text-red-500" : "text-gray-400"}`} />
                    <div>
                      <p className="font-medium text-gray-900">{req.title}</p>
                      {req.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{req.description}</p>
                      )}
                      <p className={`text-xs mt-1 ${isOverdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
                        Due: {new Date(req.dueDate).toLocaleDateString("en-GB")}
                        {req.completedAt && ` · Completed: ${new Date(req.completedAt).toLocaleDateString("en-GB")}`}
                      </p>
                      {req.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {req.attachments.map((att) => (
                            <span key={att.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                              {att.fileName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={config.color}>{config.label}</Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <form action={updateStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="requirementId" value={req.id} />
                    <select
                      name="status"
                      defaultValue={req.status}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="COMPLETE">Complete</option>
                    </select>
                    <button type="submit" className="text-xs text-indigo-600 hover:text-indigo-800">
                      Update
                    </button>
                  </form>

                  <label className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    Attach
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => handleFileUpload(req.id, e)}
                    />
                  </label>

                  <form action={deleteAction} className="ml-auto">
                    <input type="hidden" name="requirementId" value={req.id} />
                    <button
                      type="submit"
                      className="text-xs text-red-500 hover:text-red-700"
                      onClick={(e) => {
                        if (!confirm("Delete this requirement?")) e.preventDefault();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
