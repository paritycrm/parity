import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/settings";
import Link from "next/link";
import { ArrowLeft, Calendar, Crown } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default async function FinancialYearSettingsPage() {
  await requireRole(["ADMIN"]);
  const settings = await getSystemSettings();

  async function updateFinancialYear(formData: FormData) {
    "use server";
    await requireRole(["ADMIN"]);

    const month = parseInt(formData.get("month") as string);
    const day = parseInt(formData.get("day") as string);

    await prisma.systemSettings.upsert({
      where: { id: "default" },
      update: { financialYearEndMonth: month, financialYearEndDay: day },
      create: { id: "default", financialYearEndMonth: month, financialYearEndDay: day },
    });

    revalidatePath("/settings/financial-year");
    revalidatePath("/finance/legacies");
    revalidatePath("/finance/grants");
  }

  async function updateGoldDonorThreshold(formData: FormData) {
    "use server";
    await requireRole(["ADMIN"]);

    const threshold = parseFloat(formData.get("goldDonorThreshold") as string);
    if (isNaN(threshold) || threshold < 0) return;

    await prisma.systemSettings.upsert({
      where: { id: "default" },
      update: { goldDonorThreshold: threshold },
      create: { id: "default", financialYearEndMonth: 3, financialYearEndDay: 31, goldDonorThreshold: threshold },
    });

    revalidatePath("/settings/financial-year");
    revalidatePath("/crm/contacts");
  }

  const monthOptions = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const dayOptions = [
    { value: "28", label: "28th" },
    { value: "29", label: "29th" },
    { value: "30", label: "30th" },
    { value: "31", label: "31st" },
    { value: "1", label: "1st" },
    { value: "5", label: "5th" },
  ];

  const monthNames = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Year End</h1>
          <p className="text-gray-500 mt-1">Set your organisation's financial year end date</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">Current Setting</h3>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6">
            <p className="text-sm text-indigo-700">
              Your financial year ends on <span className="font-bold">{settings.financialYearEndDay} {monthNames[settings.financialYearEndMonth]}</span> each year.
              This setting is used across the system for year-on-year analysis, forecasting, and reporting.
            </p>
          </div>

          <form action={updateFinancialYear} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Year End Month"
                name="month"
                required
                defaultValue={String(settings.financialYearEndMonth)}
                options={monthOptions}
              />
              <Select
                label="Year End Day"
                name="day"
                required
                defaultValue={String(settings.financialYearEndDay)}
                options={dayOptions}
              />
            </div>
            <p className="text-xs text-gray-500">
              Most UK charities use 31 March. Companies often use 31 December. Choose the date that matches your organisation's reporting period.
            </p>
            <Button type="submit">Save Financial Year End</Button>
          </form>
        </CardContent>
      </Card>
      {/* Gold Donor Threshold */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-semibold text-gray-900">Gold Donor Threshold</h3>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-700">
              Contacts whose lifetime donations reach <span className="font-bold">£{Number(settings.goldDonorThreshold).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span> or more will be highlighted with a gold contact card throughout the CRM.
            </p>
          </div>

          <form action={updateGoldDonorThreshold} className="space-y-4">
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">Threshold Amount (£)</label>
              <Input
                name="goldDonorThreshold"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={Number(settings.goldDonorThreshold)}
              />
            </div>
            <p className="text-xs text-gray-500">
              Set the lifetime donation amount at which a contact earns Gold Donor status. Their contact card will display with a gold border and badge.
            </p>
            <Button type="submit">Save Threshold</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
