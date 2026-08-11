"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  Building2,
  PoundSterling,
  Briefcase,
  Loader2,
} from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: "contact" | "organisation" | "donation" | "case";
  href: string;
}

const categoryConfig = {
  contact: { label: "Contacts", icon: Users },
  organisation: { label: "Organisations", icon: Building2 },
  donation: { label: "Donations", icon: PoundSterling },
  case: { label: "Cases", icon: Briefcase },
} as const;

const categoryOrder: Array<SearchResult["category"]> = [
  "contact",
  "organisation",
  "donation",
  "case",
];

export function SearchCommand() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < results.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : results.length - 1
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    }
  }

  // Group results by category in defined order
  const grouped = categoryOrder
    .map((cat) => ({
      category: cat,
      items: results.filter((r) => r.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  // Flat index mapping for keyboard navigation
  let flatIndex = 0;
  const flatMap = new Map<string, number>();
  for (const group of grouped) {
    for (const item of group.items) {
      flatMap.set(item.id, flatIndex);
      flatIndex++;
    }
  }

  const showDropdown = open && (query.length >= 2 || results.length > 0);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-lg">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search contacts, organisations, donations..."
          className="flex-1 border-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="h-4 w-4 text-gray-400 animate-spin flex-shrink-0" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
          <div className="max-h-96 overflow-y-auto">
            {loading && results.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">
                Searching...
              </div>
            )}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">
                No results found for &ldquo;{query}&rdquo;
              </div>
            )}

            {grouped.map((group) => {
              const config = categoryConfig[group.category];
              const Icon = config.icon;

              return (
                <div key={group.category}>
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <Icon className="h-3.5 w-3.5" />
                      {config.label}
                    </div>
                  </div>
                  {group.items.map((result) => {
                    const idx = flatMap.get(result.id) ?? -1;
                    const isActive = idx === activeIndex;

                    return (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                          isActive
                            ? "bg-indigo-50 text-indigo-900"
                            : "hover:bg-gray-50 text-gray-900"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {result.title}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {result.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {results.length > 0 && (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">
                  &uarr;&darr;
                </kbd>{" "}
                to navigate{" "}
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono ml-1">
                  Enter
                </kbd>{" "}
                to select{" "}
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono ml-1">
                  Esc
                </kbd>{" "}
                to close
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
