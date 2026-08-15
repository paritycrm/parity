"use client";

import { usePathname, useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Radio,
  CalendarDays,
  Clock,
  Menu,
  X,
} from "lucide-react";

interface ContactInfo {
  firstName: string;
  lastName: string;
}

const navItems = [
  { label: "Overview", href: "", icon: LayoutDashboard },
  { label: "Broadcasts", href: "/broadcasts", icon: Radio },
  { label: "Assignments", href: "/assignments", icon: CalendarDays },
  { label: "Hours", href: "/hours", icon: Clock },
];

export default function VolunteerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const token = params.token as string;
  const basePath = `/volunteer-portal/${token}`;

  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/member-portal/${token}/volunteer`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.contact) {
          setContact(data.contact);
        }
      })
      .catch(() => {});
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">P</span>
              </div>
              <span className="font-semibold text-gray-900">Parity CRM</span>
            </div>
            {contact && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
                <div className="h-8 w-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-medium text-xs">
                  {contact.firstName[0]}
                  {contact.lastName[0]}
                </div>
                <span>
                  {contact.firstName} {contact.lastName}
                </span>
              </div>
            )}
            <button
              className="sm:hidden p-2 text-gray-500 hover:text-gray-700"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>

          {/* Desktop navigation tabs */}
          <nav className="hidden sm:flex -mb-px space-x-1">
            {navItems.map((item) => {
              const href = basePath + item.href;
              const isActive =
                item.href === ""
                  ? pathname === basePath
                  : pathname.startsWith(href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={href}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Mobile navigation */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-100 bg-white">
            {navItems.map((item) => {
              const href = basePath + item.href;
              const isActive =
                item.href === ""
                  ? pathname === basePath
                  : pathname.startsWith(href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-6 py-3 text-sm font-medium ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <p className="text-xs text-gray-400 text-center">
            Parity CRM &mdash; Volunteer Portal
          </p>
        </div>
      </footer>
    </div>
  );
}
