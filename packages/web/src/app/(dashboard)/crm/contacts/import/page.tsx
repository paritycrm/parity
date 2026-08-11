"use client";

import { useState, useCallback } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "upload" | "mapping" | "import";

interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
}

const CONTACT_FIELDS = [
  { value: "", label: "-- Skip --" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "mobile", label: "Mobile" },
  { value: "addressLine1", label: "Address Line 1" },
  { value: "addressLine2", label: "Address Line 2" },
  { value: "city", label: "City" },
  { value: "postcode", label: "Postcode" },
  { value: "country", label: "Country" },
  { value: "dateOfBirth", label: "Date of Birth" },
  { value: "title", label: "Title" },
  { value: "types", label: "Types (comma-separated)" },
  { value: "notes", label: "Notes" },
] as const;

type ContactFieldValue = (typeof CONTACT_FIELDS)[number]["value"];

/** Map common CSV header names to contact fields for auto-detection. */
const AUTO_DETECT_MAP: Record<string, ContactFieldValue> = {
  "first name": "firstName",
  "first_name": "firstName",
  firstname: "firstName",
  forename: "firstName",
  "last name": "lastName",
  "last_name": "lastName",
  lastname: "lastName",
  surname: "lastName",
  email: "email",
  "email address": "email",
  "e-mail": "email",
  phone: "phone",
  "phone number": "phone",
  telephone: "phone",
  tel: "phone",
  mobile: "mobile",
  "mobile phone": "mobile",
  cell: "mobile",
  "address line 1": "addressLine1",
  address_line_1: "addressLine1",
  "address 1": "addressLine1",
  address1: "addressLine1",
  address: "addressLine1",
  "address line 2": "addressLine2",
  address_line_2: "addressLine2",
  "address 2": "addressLine2",
  address2: "addressLine2",
  city: "city",
  town: "city",
  "town/city": "city",
  postcode: "postcode",
  "post code": "postcode",
  "zip code": "postcode",
  zip: "postcode",
  "postal code": "postcode",
  country: "country",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  dateofbirth: "dateOfBirth",
  date_of_birth: "dateOfBirth",
  title: "title",
  prefix: "title",
  salutation: "title",
  type: "types",
  types: "types",
  category: "types",
  notes: "notes",
  note: "notes",
  comments: "notes",
  comment: "notes",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContactImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, ContactFieldValue>>({});

  // Import progress state
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Step 1 -- Upload & parse
  // ---------------------------------------------------------------------------

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);

      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
        complete(results) {
          const headers = results.meta.fields ?? [];
          const rows = results.data as Record<string, string>[];

          setParsed({ headers, rows });

          // Auto-detect mapping
          const detected: Record<string, ContactFieldValue> = {};
          for (const header of headers) {
            const normalised = header.toLowerCase().trim();
            if (AUTO_DETECT_MAP[normalised]) {
              detected[header] = AUTO_DETECT_MAP[normalised];
            }
          }
          setMapping(detected);
        },
      });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Step 2 -- Column mapping helpers
  // ---------------------------------------------------------------------------

  const updateMapping = (csvHeader: string, field: ContactFieldValue) => {
    setMapping((prev) => ({ ...prev, [csvHeader]: field }));
  };

  /** Check that firstName and lastName are mapped (minimum requirement). */
  const isMappingValid = () => {
    const vals = Object.values(mapping);
    return vals.includes("firstName") && vals.includes("lastName");
  };

  /** Build a mapped contact object from a CSV row. */
  const mapRow = (row: Record<string, string>) => {
    const contact: Record<string, string | string[]> = {};
    for (const [csvHeader, field] of Object.entries(mapping)) {
      if (!field) continue; // skipped
      const value = (row[csvHeader] ?? "").trim();
      if (!value) continue;

      if (field === "types") {
        contact[field] = value
          .split(",")
          .map((t) => t.trim().toUpperCase())
          .filter((t) =>
            ["DONOR", "VOLUNTEER", "BENEFICIARY", "SUPPORTER", "MEMBER"].includes(t),
          );
      } else {
        contact[field] = value;
      }
    }
    return contact;
  };

  // ---------------------------------------------------------------------------
  // Step 3 -- Import
  // ---------------------------------------------------------------------------

  const startImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setProgress(0);
    setResult(null);

    const allContacts = parsed.rows.map(mapRow);
    const batchSize = 50;
    let totalImported = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < allContacts.length; i += batchSize) {
      const batch = allContacts.slice(i, i + batchSize);

      try {
        const res = await fetch("/api/contacts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contacts: batch }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          allErrors.push(
            `Batch ${Math.floor(i / batchSize) + 1}: ${errBody.error ?? res.statusText}`,
          );
        } else {
          const data = await res.json();
          totalImported += data.imported ?? 0;
          totalSkipped += data.skipped ?? 0;
          if (data.errors?.length) allErrors.push(...data.errors);
        }
      } catch (err) {
        allErrors.push(
          `Batch ${Math.floor(i / batchSize) + 1}: Network error`,
        );
      }

      setProgress(Math.min(i + batchSize, allContacts.length));
    }

    setResult({
      imported: totalImported,
      skipped: totalSkipped,
      errors: allErrors,
    });
    setImporting(false);
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const totalRows = parsed?.rows.length ?? 0;

  const renderStepIndicator = () => {
    const steps: { key: Step; label: string; num: number }[] = [
      { key: "upload", label: "Upload", num: 1 },
      { key: "mapping", label: "Map Columns", num: 2 },
      { key: "import", label: "Import", num: 3 },
    ];
    const currentIdx = steps.findIndex((s) => s.key === step);

    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((s, idx) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                idx < currentIdx
                  ? "bg-indigo-600 text-white"
                  : idx === currentIdx
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-500"
              }`}
            >
              {idx < currentIdx ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                s.num
              )}
            </div>
            <span
              className={`text-sm ${
                idx <= currentIdx
                  ? "text-gray-900 font-medium"
                  : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
            {idx < steps.length - 1 && (
              <div
                className={`w-12 h-px ${
                  idx < currentIdx ? "bg-indigo-600" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step 1 -- Upload UI
  // ---------------------------------------------------------------------------

  const renderUpload = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload CSV File
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-10 hover:border-indigo-400 transition-colors">
          <FileSpreadsheet className="w-10 h-10 text-gray-400 mb-3" />
          <p className="text-sm text-gray-600 mb-4">
            Select a CSV file to import contacts
          </p>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
              <Upload className="w-4 h-4" />
              Choose File
            </span>
          </label>
          {fileName && (
            <p className="mt-3 text-sm text-gray-500">
              Selected: <span className="font-medium">{fileName}</span>
            </p>
          )}
        </div>

        {parsed && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{totalRows} rows found</Badge>
              <Badge variant="secondary">
                {parsed.headers.length} columns
              </Badge>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Preview (first 5 rows)
              </h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {parsed.headers.map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsed.rows.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        {parsed.headers.map((h) => (
                          <td
                            key={h}
                            className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate"
                          >
                            {row[h] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep("mapping")}>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ---------------------------------------------------------------------------
  // Step 2 -- Column Mapping UI
  // ---------------------------------------------------------------------------

  const renderMapping = () => {
    const previewRows = parsed?.rows.slice(0, 3) ?? [];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Map Columns to Contact Fields
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-gray-600">
            Match each CSV column to the corresponding contact field. Columns
            mapped to &quot;Skip&quot; will be ignored.
          </p>

          <div className="space-y-3">
            {parsed?.headers.map((header) => (
              <div
                key={header}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-50"
              >
                <div className="w-1/3">
                  <span className="text-sm font-medium text-gray-800">
                    {header}
                  </span>
                  {parsed.rows[0]?.[header] && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      e.g. {parsed.rows[0][header]}
                    </p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                <select
                  value={mapping[header] ?? ""}
                  onChange={(e) =>
                    updateMapping(header, e.target.value as ContactFieldValue)
                  }
                  className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {CONTACT_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                {mapping[header] && (
                  <Badge variant="default" className="shrink-0">
                    Mapped
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {/* Mapped data preview */}
          {previewRows.length > 0 && isMappingValid() && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Import Preview (first 3 rows)
              </h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {CONTACT_FIELDS.filter(
                        (f) =>
                          f.value && Object.values(mapping).includes(f.value),
                      ).map((f) => (
                        <th
                          key={f.value}
                          className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
                        >
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.map((row, i) => {
                      const mapped = mapRow(row);
                      return (
                        <tr key={i}>
                          {CONTACT_FIELDS.filter(
                            (f) =>
                              f.value &&
                              Object.values(mapping).includes(f.value),
                          ).map((f) => (
                            <td
                              key={f.value}
                              className="px-3 py-2 text-gray-700 whitespace-nowrap"
                            >
                              {Array.isArray(mapped[f.value])
                                ? (mapped[f.value] as string[]).join(", ")
                                : (mapped[f.value] as string) ?? ""}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!isMappingValid() && (
            <p className="text-sm text-amber-600 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Please map at least First Name and Last Name to continue.
            </p>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("upload")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={() => setStep("import")}
              disabled={!isMappingValid()}
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ---------------------------------------------------------------------------
  // Step 3 -- Import UI
  // ---------------------------------------------------------------------------

  const renderImport = () => {
    const pct = totalRows > 0 ? Math.round((progress / totalRows) * 100) : 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {result ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
            {result ? "Import Complete" : "Import Contacts"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pre-import summary */}
          {!importing && !result && (
            <>
              <div className="rounded-lg bg-gray-50 p-4 space-y-2">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">{totalRows}</span> contacts
                  ready to import from{" "}
                  <span className="font-medium">{fileName}</span>
                </p>
                <p className="text-sm text-gray-500">
                  Mapped fields:{" "}
                  {CONTACT_FIELDS.filter(
                    (f) =>
                      f.value && Object.values(mapping).includes(f.value),
                  )
                    .map((f) => f.label)
                    .join(", ")}
                </p>
                <p className="text-sm text-gray-500">
                  Contacts will be imported in batches of 50. Duplicates (by
                  email) will be skipped.
                </p>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("mapping")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={startImport}>
                  Start Import
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {/* Progress bar */}
          {importing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Importing contacts...</span>
                <span>
                  {progress} / {totalRows} ({pct}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-green-50 p-4 text-center">
                  <p className="text-2xl font-semibold text-green-700">
                    {result.imported}
                  </p>
                  <p className="text-sm text-green-600">Imported</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-semibold text-amber-700">
                    {result.skipped}
                  </p>
                  <p className="text-sm text-amber-600">Skipped</p>
                </div>
                <div className="rounded-lg bg-red-50 p-4 text-center">
                  <p className="text-2xl font-semibold text-red-700">
                    {result.errors.length}
                  </p>
                  <p className="text-sm text-red-600">Errors</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <h4 className="text-sm font-medium text-red-800 mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    Errors
                  </h4>
                  <ul className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end">
                <Link href="/crm/contacts">
                  <Button>View Contacts</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link
          href="/crm/contacts"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Contacts
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">
          Import Contacts
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Import contacts from a CSV file into your CRM.
        </p>
      </div>

      {renderStepIndicator()}

      {step === "upload" && renderUpload()}
      {step === "mapping" && renderMapping()}
      {step === "import" && renderImport()}
    </div>
  );
}
