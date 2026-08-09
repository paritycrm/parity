"use client";

import { useState } from "react";

interface Org {
  id: string;
  name: string;
}

export function FunderSelect({
  funderOrgs,
  defaultFunderId,
  defaultFunderName,
  required = false,
}: {
  funderOrgs: Org[];
  defaultFunderId?: string | null;
  defaultFunderName?: string | null;
  required?: boolean;
}) {
  const [funderId, setFunderId] = useState(defaultFunderId || "");
  const [funderName, setFunderName] = useState(defaultFunderName || "");

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Funder Organisation</label>
        <select
          value={funderId}
          onChange={(e) => {
            const id = e.target.value;
            setFunderId(id);
            if (id) {
              const org = funderOrgs.find((o) => o.id === id);
              if (org) setFunderName(org.name);
            }
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— Enter funder manually —</option>
          {funderOrgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <input type="hidden" name="funderId" value={funderId} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Funder Name</label>
        <input
          name="funderName"
          value={funderName}
          onChange={(e) => setFunderName(e.target.value)}
          required={required}
          readOnly={!!funderId}
          placeholder="e.g. National Lottery Heritage Fund"
          className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            funderId ? "bg-gray-50 text-gray-600" : ""
          }`}
        />
      </div>
    </div>
  );
}
