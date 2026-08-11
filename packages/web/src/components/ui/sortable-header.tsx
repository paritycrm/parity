// Server component (no "use client")
// Goes to: packages/web/src/components/ui/sortable-header.tsx
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  currentDir: string;
  baseUrl: string;
  searchParams?: Record<string, string>;
}

export function SortableHeader({ label, field, currentSort, currentDir, baseUrl, searchParams = {} }: SortableHeaderProps) {
  const isActive = currentSort === field;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams(searchParams);
  params.set("sort", field);
  params.set("dir", nextDir);
  params.delete("page"); // Reset to page 1 on sort change

  const Icon = isActive ? (currentDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
      <Link href={`${baseUrl}?${params.toString()}`} className="flex items-center gap-1 hover:text-gray-700">
        {label}
        <Icon className={`h-3 w-3 ${isActive ? "text-indigo-600" : "text-gray-300"}`} />
      </Link>
    </th>
  );
}
