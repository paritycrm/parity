// Goes to: packages/web/src/components/contacts/contacts-table.tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Crown,
  Heart,
  Package,
  Ticket,
  Tag,
  Archive,
  Trash2,
  Download,
  X,
  ChevronDown,
  Plus,
  Check,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactRow {
  id: string;
  donorId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  types: string[];
  isArchived: boolean;
  isLotteryMember: boolean;
  organisation: { name: string } | null;
  tags: Array<{ tagId: string; tag: { name: string } }>;
  giftAids: Array<{ id: string; type: string }>;
  donations: Array<{ amount: any }>;
  volunteerProfile: any;
}

interface ContactsTableProps {
  contacts: ContactRow[];
  goldDonorThreshold: number;
  availableTags: Array<{ id: string; name: string }>;
  currentSort: string;
  currentDir: string;
  sortParams: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Sortable header (inline — the other agent may also add one; integration
// instructions explain how to reconcile)
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  field,
  currentSort,
  currentDir,
  sortParams,
  className,
}: {
  label: string;
  field: string;
  currentSort: string;
  currentDir: string;
  sortParams: Record<string, string>;
  className?: string;
}) {
  const isActive = currentSort === field;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams(sortParams);
  params.set("sort", field);
  params.set("dir", nextDir);

  return (
    <th className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${className || ""}`}>
      <Link
        href={`?${params.toString()}`}
        className="group inline-flex items-center gap-1 hover:text-gray-700"
      >
        {label}
        <span className="text-gray-400 group-hover:text-gray-500">
          {isActive ? (currentDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Tag picker popover
// ---------------------------------------------------------------------------

function TagPicker({
  availableTags,
  onSelect,
  onClose,
}: {
  availableTags: Array<{ id: string; name: string }>;
  onSelect: (tagId: string | null, tagName: string | null) => void;
  onClose: () => void;
}) {
  const [newTagName, setNewTagName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
    >
      <div className="p-2 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-500 uppercase px-2 py-1">
          Select a tag
        </p>
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {availableTags.map((tag) => (
          <button
            key={tag.id}
            onClick={() => onSelect(tag.id, null)}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center gap-2"
          >
            <Tag className="h-3.5 w-3.5 text-gray-400" />
            {tag.name}
          </button>
        ))}
        {availableTags.length === 0 && (
          <p className="px-3 py-2 text-sm text-gray-400">No tags yet</p>
        )}
      </div>
      <div className="border-t border-gray-100 p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newTagName.trim()) {
              onSelect(null, newTagName.trim());
            }
          }}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Create new tag..."
            className="flex-1 text-sm border-0 bg-transparent focus:outline-none focus:ring-0 placeholder:text-gray-400"
          />
          {newTagName.trim() && (
            <button
              type="submit"
              className="text-indigo-600 hover:text-indigo-700"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  title,
  message,
  details,
  confirmLabel,
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  details?: string[];
  confirmLabel: string;
  confirmVariant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const btnClass =
    confirmVariant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-amber-500 hover:bg-amber-600 text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1">{message}</p>
            {details && details.length > 0 && (
              <ul className="mt-3 space-y-1">
                {details.map((d, i) => (
                  <li key={i} className="text-xs text-gray-500">
                    &bull; {d}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg ${btnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContactsTable({
  contacts,
  goldDonorThreshold,
  availableTags,
  currentSort,
  currentDir,
  sortParams,
}: ContactsTableProps) {
  const router = useRouter();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // UI state
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const allSelected =
    contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0;

  // Clear selection when contacts change (e.g. after router.refresh())
  useEffect(() => {
    setSelectedIds(new Set());
  }, [contacts]);

  // Auto-dismiss success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  }, [allSelected, contacts]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setShowTagPicker(false);
    setShowArchiveConfirm(false);
    setShowDeleteConfirm(false);
    setError(null);
  }, []);

  // ── Bulk action handler ──────────────────────────────────────────
  const executeBulkAction = useCallback(
    async (
      action: "tag" | "archive" | "delete" | "export",
      extra?: { tagId?: string; tagName?: string }
    ) => {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const res = await fetch("/api/contacts/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            contactIds: Array.from(selectedIds),
            ...extra,
          }),
        });

        // Export returns CSV directly
        if (action === "export") {
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Export failed");
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const disposition = res.headers.get("Content-Disposition") || "";
          const filenameMatch = disposition.match(/filename="(.+?)"/);
          a.download =
            filenameMatch?.[1] ||
            `contacts-export-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setSuccessMessage(`Exported ${selectedIds.size} contact(s)`);
          setLoading(false);
          return;
        }

        const data = await res.json();

        if (!res.ok || data.success === false) {
          // Show error with details
          const message = data.error || "Action failed";
          if (data.details && data.details.length > 0) {
            setError(`${message}\n${data.details.join("\n")}`);
          } else {
            setError(message);
          }

          // If some were affected, still refresh
          if (data.affected && data.affected > 0) {
            setSuccessMessage(
              `${data.affected} contact(s) ${action === "tag" ? "tagged" : action === "archive" ? "archived" : "deleted"}`
            );
            router.refresh();
          }
        } else {
          const actionLabel =
            action === "tag"
              ? "tagged"
              : action === "archive"
                ? "archived"
                : "deleted";
          setSuccessMessage(`${data.affected} contact(s) ${actionLabel}`);
          clearSelection();
          router.refresh();
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred");
      } finally {
        setLoading(false);
        setShowTagPicker(false);
        setShowArchiveConfirm(false);
        setShowDeleteConfirm(false);
      }
    },
    [selectedIds, router, clearSelection]
  );

  // ── Type badge colors ────────────────────────────────────────────
  const typeColors: Record<string, string> = {
    DONOR: "bg-green-100 text-green-800",
    VOLUNTEER: "bg-indigo-100 text-indigo-800",
  };

  // ── Shared sort header props ─────────────────────────────────────
  const sortHeaderProps = { currentSort, currentDir, sortParams };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  aria-label="Select all contacts"
                />
              </th>
              <SortableHeader label="ID" field="donorId" className="w-16" {...sortHeaderProps} />
              <SortableHeader label="Name" field="lastName" {...sortHeaderProps} />
              <SortableHeader label="Email" field="email" {...sortHeaderProps} />
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Organisation
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tags
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {contacts.map((contact) => {
              const lifetimeTotal = contact.donations.reduce(
                (sum, d) => sum + Number(d.amount),
                0
              );
              const isGold = lifetimeTotal >= goldDonorThreshold;
              const isSelected = selectedIds.has(contact.id);

              return (
                <tr
                  key={contact.id}
                  className={`${
                    isGold
                      ? "bg-gradient-to-r from-amber-50 to-yellow-50 hover:from-amber-100 hover:to-yellow-100"
                      : isSelected
                        ? "bg-indigo-50 hover:bg-indigo-100"
                        : "hover:bg-gray-50"
                  } ${contact.isArchived ? "opacity-60" : ""} transition-colors`}
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(contact.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label={`Select ${contact.firstName} ${contact.lastName}`}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-mono text-gray-400">
                      {String(contact.donorId).padStart(5, "0")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/crm/contacts/${contact.id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar
                        firstName={contact.firstName}
                        lastName={contact.lastName}
                        size="sm"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">
                            {contact.firstName} {contact.lastName}
                          </p>
                          {isGold && (
                            <Crown className="h-3.5 w-3.5 text-amber-500" />
                          )}
                          {contact.isArchived && (
                            <span className="inline-flex items-center rounded-md bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold">
                              Archived
                            </span>
                          )}
                        </div>
                        {contact.phone && (
                          <p className="text-xs text-gray-500">
                            {contact.phone}
                          </p>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {contact.email || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 flex-wrap">
                      {contact.types.map((t) => (
                        <span
                          key={t}
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${typeColors[t] || "bg-gray-100 text-gray-800"}`}
                        >
                          {t}
                        </span>
                      ))}
                      {contact.giftAids.some(
                        (ga) => ga.type === "STANDARD"
                      ) && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-pink-100 text-pink-800 px-1.5 py-0.5 text-[10px] font-semibold">
                          <Heart className="h-2.5 w-2.5" />
                          GA
                        </span>
                      )}
                      {contact.giftAids.some(
                        (ga) => ga.type === "RETAIL"
                      ) && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-100 text-purple-800 px-1.5 py-0.5 text-[10px] font-semibold">
                          <Package className="h-2.5 w-2.5" />
                          RGA
                        </span>
                      )}
                      {contact.isLotteryMember && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold">
                          <Ticket className="h-2.5 w-2.5" />
                          LM
                        </span>
                      )}
                      {isGold && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-400 text-white px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">
                          <Crown className="h-2.5 w-2.5" />
                          GOLD
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {contact.organisation?.name || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {contact.tags.map((ct) => (
                        <Badge
                          key={ct.tagId}
                          variant="outline"
                          className="text-xs"
                        >
                          {ct.tag.name}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Floating bulk action bar ────────────────────────────────── */}
      {someSelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-3 bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-3 min-w-[500px]">
            {/* Selected count */}
            <span className="text-sm font-medium whitespace-nowrap">
              {selectedIds.size} contact{selectedIds.size !== 1 ? "s" : ""}{" "}
              selected
            </span>

            <div className="w-px h-6 bg-gray-700" />

            {/* Action buttons */}
            <div className="flex items-center gap-1 relative">
              {/* Tag */}
              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Tag className="h-4 w-4" />
                Add Tag
                <ChevronDown className="h-3 w-3" />
              </button>

              {/* Tag picker popover */}
              {showTagPicker && (
                <TagPicker
                  availableTags={availableTags}
                  onSelect={(tagId, tagName) => {
                    executeBulkAction("tag", { tagId: tagId || undefined, tagName: tagName || undefined });
                  }}
                  onClose={() => setShowTagPicker(false)}
                />
              )}

              {/* Archive */}
              <button
                onClick={() => setShowArchiveConfirm(true)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
                Archive
              </button>

              {/* Delete */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>

              {/* Export */}
              <button
                onClick={() => executeBulkAction("export")}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export Selected
              </button>
            </div>

            <div className="w-px h-6 bg-gray-700" />

            {/* Loading indicator */}
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            )}

            {/* Clear selection */}
            <button
              onClick={clearSelection}
              className="p-1 rounded-md hover:bg-gray-800 transition-colors"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Success toast ───────────────────────────────────────────── */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-50 border border-green-200 rounded-lg px-4 py-3 shadow-lg flex items-center gap-2">
          <Check className="h-4 w-4 text-green-600" />
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {/* ── Error toast ─────────────────────────────────────────────── */}
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 rounded-lg px-4 py-3 shadow-lg max-w-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              {error.split("\n").map((line, i) => (
                <p key={i} className={`text-sm ${i === 0 ? "text-red-800 font-medium" : "text-red-600"}`}>
                  {line}
                </p>
              ))}
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Confirm dialogs ─────────────────────────────────────────── */}
      {showArchiveConfirm && (
        <ConfirmDialog
          title="Archive contacts"
          message={`Are you sure you want to archive ${selectedIds.size} contact${selectedIds.size !== 1 ? "s" : ""}? Archived contacts will be hidden from the default view but can still be found using the "Show Archived" filter.`}
          confirmLabel="Archive"
          confirmVariant="warning"
          onConfirm={() => executeBulkAction("archive")}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete contacts"
          message={`Are you sure you want to permanently delete ${selectedIds.size} contact${selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone. Contacts with linked donations or cases cannot be deleted.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          onConfirm={() => executeBulkAction("delete")}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
