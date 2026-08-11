// packages/web/src/app/(dashboard)/crm/contacts/new/page.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DuplicateWarning } from "@/components/ui/duplicate-warning";
import Link from "next/link";
import { ArrowLeft, UserCheck } from "lucide-react";

interface Organisation {
  id: string;
  name: string;
}

interface DuplicateMatch {
  id: string;
  donorId: number | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  matchType: "EMAIL" | "NAME_POSTCODE" | "PHONE" | "NAME_SIMILAR";
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export default function NewContactPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/organisations")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setOrganisations(data);
        else if (data.organisations) setOrganisations(data.organisations);
      })
      .catch(() => {});
  }, []);

  async function checkDuplicates(): Promise<DuplicateMatch[]> {
    const form = formRef.current;
    if (!form) return [];

    const formData = new FormData(form);
    const firstName = (formData.get("firstName") as string)?.trim();
    const lastName = (formData.get("lastName") as string)?.trim();
    const email = (formData.get("email") as string)?.trim();
    const phone = (formData.get("phone") as string)?.trim();
    const postcode = (formData.get("postcode") as string)?.trim();

    if (!firstName && !lastName) return [];

    try {
      const res = await fetch("/api/contacts/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, phone, postcode }),
      });

      if (!res.ok) return [];

      const data = await res.json();
      return data.matches || [];
    } catch {
      return [];
    }
  }

  async function submitForm() {
    const form = formRef.current;
    if (!form) return;

    setIsSubmitting(true);

    const formData = new FormData(form);
    const selectedTypes = formData.getAll("types") as string[];

    const body: Record<string, unknown> = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      type: selectedTypes[0] || "OTHER",
      types: selectedTypes,
      dateOfBirth: (formData.get("dateOfBirth") as string) || null,
      addressLine1: (formData.get("addressLine1") as string) || null,
      city: (formData.get("city") as string) || null,
      postcode: (formData.get("postcode") as string) || null,
      country: (formData.get("country") as string) || null,
      organisationId: (formData.get("organisationId") as string) || null,
      consentPost: formData.get("consentPost") === "on",
      consentEmail: formData.get("consentEmail") === "on",
      consentPhone: formData.get("consentPhone") === "on",
      consentSms: formData.get("consentSms") === "on",
    };

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const contact = await res.json();
        router.push(`/crm/contacts/${contact.id}`);
      } else {
        setIsSubmitting(false);
        alert("Failed to create contact. Please try again.");
      }
    } catch {
      setIsSubmitting(false);
      alert("Failed to create contact. Please try again.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate required fields
    const form = formRef.current;
    if (!form || !form.checkValidity()) {
      form?.reportValidity();
      return;
    }

    setIsChecking(true);
    const matches = await checkDuplicates();
    setIsChecking(false);

    if (matches.length > 0) {
      setDuplicates(matches);
      setShowDuplicateWarning(true);
    } else {
      await submitForm();
    }
  }

  function handleProceedAnyway() {
    setShowDuplicateWarning(false);
    setDuplicates([]);
    submitForm();
  }

  function handleCancelDuplicate() {
    setShowDuplicateWarning(false);
    setDuplicates([]);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/crm/contacts"
          className="text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add Contact</h1>
      </div>

      {showDuplicateWarning && (
        <DuplicateWarning
          matches={duplicates}
          onProceed={handleProceedAnyway}
          onCancel={handleCancelDuplicate}
        />
      )}

      <Card>
        <CardContent className="pt-6">
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" required />
              <Input label="Last Name" name="lastName" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Email" name="email" type="email" />
              <Input label="Phone" name="phone" type="tel" />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Contact Type(s)
              </label>
              <p className="text-xs text-gray-500">
                A contact can be both a volunteer and a donor
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="types"
                    value="VOLUNTEER"
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Volunteer
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="types"
                    value="DONOR"
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  Donor
                </label>
              </div>
            </div>

            <Input label="Date of Birth" name="dateOfBirth" type="date" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organisation
              </label>
              <SearchableSelect
                name="organisationId"
                placeholder="Select organisation (optional)"
                options={organisations.map((org) => ({
                  value: org.id,
                  label: org.name,
                }))}
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Address</h3>
              <Input label="Address Line 1" name="addressLine1" />
              <div className="grid grid-cols-3 gap-4">
                <Input label="City" name="city" />
                <Input label="Postcode" name="postcode" />
                <Input label="Country" name="country" />
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">
                Communication Consent
              </h3>
              <p className="text-xs text-gray-500">
                Record the contact&apos;s communication preferences (GDPR)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="consentPost"
                    className="rounded border-gray-300"
                  />
                  Post
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="consentEmail"
                    className="rounded border-gray-300"
                  />
                  Email
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="consentPhone"
                    className="rounded border-gray-300"
                  />
                  Phone
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="consentSms"
                    className="rounded border-gray-300"
                  />
                  SMS
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Link href="/crm/contacts">
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isChecking || isSubmitting}>
                {isChecking ? (
                  "Checking for duplicates..."
                ) : isSubmitting ? (
                  "Creating..."
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Create Contact
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
