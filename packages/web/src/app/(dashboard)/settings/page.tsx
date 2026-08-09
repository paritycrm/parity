import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  FileText,
  FileInput,
  Zap,
  Users,
  Calendar,
  Store,
  Palette,
  Target,
  Activity,
  Clock,
  User,
  CreditCard,
  Building2,
} from "lucide-react";
import HeadOfficeForm from "./head-office-form";
import LetterheadForm from "./letterhead-form";

export default async function SettingsPage() {
  const user = await requireAuth();

  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { headOfficeAddress: true, headOfficeLat: true, headOfficeLng: true, letterheadImage: true },
  });

  const settingsLinks = [
    { icon: Users, title: "Users", desc: "Manage user accounts, roles, and permissions", href: "/settings/users", color: "text-indigo-600 bg-indigo-50" },
    { icon: Palette, title: "Branding", desc: "Logo, colours, and organisation name", href: "/settings/branding", color: "text-pink-600 bg-pink-50" },
    { icon: Calendar, title: "Financial Year", desc: "Financial year end and Gold Donor threshold", href: "/settings/financial-year", color: "text-blue-600 bg-blue-50" },
    { icon: CreditCard, title: "Payment Methods", desc: "Configure how donations and payments are received", href: "/settings/payment-methods", color: "text-green-600 bg-green-50" },
    { icon: Building2, title: "Organisation Roles", desc: "Supplier, Funder, Partner — manage organisation roles", href: "/settings/organisation-roles", color: "text-orange-600 bg-orange-50" },
    { icon: FileText, title: "Donation Types", desc: "Donation types and Gift Aid eligibility settings", href: "/settings/donation-types", color: "text-rose-600 bg-rose-50" },
    { icon: Target, title: "Events", desc: "Event types and annual targets", href: "/settings/events", color: "text-orange-600 bg-orange-50" },
    { icon: Store, title: "Shops", desc: "Shop locations and Retail Gift Aid QR codes", href: "/settings/shops", color: "text-emerald-600 bg-emerald-50" },
    { icon: Zap, title: "Integrations", desc: "Email providers, APIs, and third-party services", href: "/settings/integrations", color: "text-yellow-600 bg-yellow-50" },
    { icon: FileInput, title: "Form Builder", desc: "Create public registration and data capture forms", href: "/settings/forms", color: "text-teal-600 bg-teal-50" },
    { icon: Activity, title: "Automations", desc: "Trigger-based workflows and automation rules", href: "/settings/automations", color: "text-purple-600 bg-purple-50" },
    { icon: Zap, title: "Webhooks", desc: "Outbound event notifications to external services", href: "/settings/webhooks", color: "text-amber-600 bg-amber-50" },
    { icon: Clock, title: "Scheduled Jobs", desc: "Automated scheduled tasks and reminders", href: "/settings/scheduled-jobs", color: "text-cyan-600 bg-cyan-50" },
    { icon: FileText, title: "Data Retention", desc: "How long data is kept before archiving", href: "/settings/data-retention", color: "text-violet-600 bg-violet-50" },
    { icon: Shield, title: "Audit Log", desc: "Review all system activities and changes", href: "/settings/audit-log", color: "text-slate-600 bg-slate-50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your organization&apos;s configuration and policies</p>
      </div>

      {/* Top row: Current User + Head Office + Letterhead */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current User — compact */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
              <User className="h-4 w-4 text-teal-600" />
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">Current User</h3>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium text-gray-900">{user.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-900 truncate ml-2">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Role</span>
              <Badge className="bg-teal-100 text-teal-800 text-xs">{user.role}</Badge>
            </div>
          </div>
        </Card>

        {/* Head Office — compact */}
        <Card className="p-4">
          <HeadOfficeForm
            currentAddress={settings?.headOfficeAddress || null}
            lat={settings?.headOfficeLat || null}
            lng={settings?.headOfficeLng || null}
          />
        </Card>

        {/* Letterhead — compact */}
        <Card className="p-4">
          <LetterheadForm currentImage={settings?.letterheadImage || null} />
        </Card>
      </div>

      {/* Settings grid — compact tiles with hover descriptions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {settingsLinks.map((link) => {
          const Icon = link.icon;
          const [textColor, bgColor] = link.color.split(" ");
          return (
            <Link key={link.title} href={link.href} className="relative group">
              <Card className="p-4 h-full transition-all group-hover:shadow-md group-hover:-translate-y-0.5 cursor-pointer overflow-visible">
                <div className="flex flex-col items-center text-center gap-2.5">
                  <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <Icon className={`h-5 w-5 ${textColor}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 leading-tight">
                    {link.title}
                  </span>
                </div>
              </Card>
              {/* Tooltip on hover */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
                {link.desc}
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Help — compact inline */}
      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-lg text-sm">
        <span className="text-indigo-600 font-medium">Need help?</span>
        <span className="text-indigo-700">Contact your system administrator for GDPR, data retention, or account queries.</span>
      </div>
    </div>
  );
}
