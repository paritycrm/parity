"use client";

import { useState } from "react";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "documents", label: "Documents" },
  { key: "correspondence", label: "Correspondence" },
  { key: "requirements", label: "Requirements" },
  { key: "restrictions", label: "Restrictions" },
  { key: "payments", label: "Payments" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function GrantTabs({
  children,
  counts,
}: {
  children: Record<TabKey, React.ReactNode>;
  counts?: Partial<Record<TabKey, number>>;
}) {
  const [active, setActive] = useState<TabKey>("overview");

  return (
    <div>
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active === tab.key
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {counts?.[tab.key] != null && counts[tab.key]! > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      <div>{children[active]}</div>
    </div>
  );
}
