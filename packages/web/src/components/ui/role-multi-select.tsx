"use client";

import { useState, useRef, useEffect } from "react";

interface Role {
  id: string;
  name: string;
  colour: string | null;
}

export function RoleMultiSelect({
  roles,
  selectedIds,
  name = "roleIds",
}: {
  roles: Role[];
  selectedIds: string[];
  name?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedRoles = roles.filter((r) => selected.has(r.id));

  return (
    <div ref={ref} className="relative">
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[38px]"
      >
        {selectedRoles.length === 0 ? (
          <span className="text-gray-400">Select roles...</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedRoles.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                style={{ backgroundColor: role.colour || "#6366f1" }}
              >
                {role.name}
              </span>
            ))}
          </div>
        )}
        <svg className="ml-auto h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => toggle(role.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center ${
                  selected.has(role.id) ? "bg-indigo-600 border-indigo-600" : "border-gray-300"
                }`}
              >
                {selected.has(role.id) && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                style={{ backgroundColor: role.colour || "#6366f1" }}
              >
                {role.name}
              </span>
            </button>
          ))}
          {roles.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">No roles available</p>
          )}
        </div>
      )}
    </div>
  );
}
