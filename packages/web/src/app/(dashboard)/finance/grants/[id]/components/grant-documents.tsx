"use client";

import { useState, useTransition } from "react";
import { Upload, FileText, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "./pdf-viewer";

interface Doc {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: string;
  createdAt: string;
}

export function GrantDocuments({
  documents,
  grantId,
  uploadAction,
  deleteAction,
}: {
  documents: Doc[];
  grantId: string;
  uploadAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [viewingDoc, setViewingDoc] = useState<Doc | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      // Upload to API to get base64
      const apiForm = new FormData();
      apiForm.append("file", file);
      const res = await fetch("/api/grants/documents", { method: "POST", body: apiForm });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Upload failed");
        return;
      }

      // Save to database via server action
      const formData = new FormData();
      formData.set("grantId", grantId);
      formData.set("fileName", data.fileName);
      formData.set("fileType", data.fileType);
      formData.set("fileSize", String(data.fileSize));
      formData.set("fileData", data.fileData);

      startTransition(() => uploadAction(formData));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            onChange={handleUpload}
            disabled={uploading || isPending}
          />
          <Button variant="outline" size="sm" asChild>
            <span>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Uploading..." : "Upload Document"}
            </span>
          </Button>
        </label>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No documents uploaded. Upload grant applications, award letters, contracts, and more.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {formatSize(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString("en-GB")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setViewingDoc(doc)}
                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <form action={deleteAction}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <button
                    type="submit"
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                    title="Delete"
                    onClick={(e) => {
                      if (!confirm("Delete this document?")) e.preventDefault();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingDoc && (
        <PdfViewer
          dataUrl={viewingDoc.fileData}
          fileName={viewingDoc.fileName}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
}
