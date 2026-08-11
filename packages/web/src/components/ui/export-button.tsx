// packages/web/src/components/ui/export-button.tsx
"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";

export function ExportButton() {
  const searchParams = useSearchParams();

  function handleExport() {
    const params = new URLSearchParams();

    const search = searchParams.get("search");
    const type = searchParams.get("type");
    const lottery = searchParams.get("lottery");
    const missing = searchParams.get("missing");
    const archived = searchParams.get("archived");

    if (search) params.set("search", search);
    if (type) params.set("type", type);
    if (lottery) params.set("lottery", lottery);
    if (missing) params.set("missing", missing);
    if (archived) params.set("archived", archived);

    const query = params.toString();
    window.location.href = `/api/contacts/export${query ? `?${query}` : ""}`;
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export
    </Button>
  );
}
