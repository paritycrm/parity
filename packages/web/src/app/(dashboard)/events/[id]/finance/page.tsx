import { formatDate, formatShortDate } from '@/lib/utils';
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Target, CheckCircle2, Mail, Save } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PLDashboard } from "./pl-dashboard";
import {
  addIncomeLine,
  updateIncomeLine,
  removeIncomeLine,
  addCostLine,
  updateCostLine,
  removeCostLine,
  saveTargets,
  completeEvent,
} from "./actions";
import { saveEventAsTemplate } from "@/app/(dashboard)/settings/events/templates/actions";

const INCOME_CATEGORIES = [
  { value: "REGISTRATION_FEES", label: "Registration Fees" },
  { value: "TICKET_SALES", label: "Ticket Sales" },
  { value: "BUCKET_COLLECTION", label: "Bucket Collection" },
  { value: "DONATIONS_ON_DAY", label: "Donations on the Day" },
  { value: "PITCH_FEES", label: "Pitch / Stand Fees" },
  { value: "SPONSORSHIP", label: "Sponsorship" },
  { value: "MERCHANDISE", label: "Merchandise Sales" },
  { value: "RAFFLE", label: "Raffle / Tombola" },
  { value: "AUCTION", label: "Auction" },
  { value: "BAR_TAKINGS", label: "Bar Takings" },
  { value: "CAKE_SALE", label: "Cake Sale" },
  { value: "OTHER", label: "Other" },
];

const COST_CATEGORIES = [
  { value: "VENUE_HIRE", label: "Venue Hire" },
  { value: "CATERING", label: "Catering / Food" },
  { value: "ENTERTAINMENT", label: "Entertainment / Speakers" },
  { value: "EQUIPMENT", label: "Equipment Hire" },
  { value: "MARKETING", label: "Marketing / Advertising" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "STAFFING", label: "Staffing / Agency" },
  { value: "TRANSPORT", label: "Transport / Logistics" },
  { value: "PRINTING", label: "Printing / Signage" },
  { value: "LICENSES", label: "Licences / Permits" },
  { value: "DECORATIONS", label: "Decorations / Theming" },
  { value: "FIRST_AID", label: "First Aid / Medical" },
  { value: "SECURITY", label: "Security" },
  { value: "WASTE_DISPOSAL", label: "Waste Disposal / Clean-up" },
  { value: "PHOTOGRAPHY", label: "Photography / Video" },
  { value: "PRIZES", label: "Prizes / Awards" },
  { value: "OTHER", label: "Other" },
];

export default async function EventFinancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const [event, suppliers] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        incomeLines: {
          orderBy: { sortOrder: "asc" },
          include: { organisation: { select: { id: true, name: true } } },
        },
        costLines: {
          orderBy: { sortOrder: "asc" },
          include: { organisation: { select: { id: true, name: true } } },
        },
        finance: true,
      },
    }),
    prisma.organisation.findMany({
      where: {
        isArchived: false,
        roleAssignments: { some: { role: { name: "Supplier" } } },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!event) notFound();

  const totalIncome = event.incomeLines.reduce((s, l) => s + Number(l.actual), 0);
  const totalCosts = event.costLines.reduce((s, l) => s + Number(l.actual), 0);
  const estimatedCosts = event.costLines.reduce((s, l) => s + Number(l.estimated), 0);
  const profit = totalIncome - totalCosts;

  const finance = event.finance;
  const isCompleted = event.status === "COMPLETED" && !!finance?.completedAt;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/events" className="hover:text-gray-700">Events</Link>
          <span>/</span>
          <Link href={`/events/${id}`} className="hover:text-gray-700">{event.name}</Link>
          <span>/</span>
          <span>P&amp;L</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Profit &amp; Loss</h1>
            <p className="text-gray-500 mt-1">{event.name}</p>
          </div>
          <Link href={`/events/${id}/finance/suppliers`}>
            <Button variant="outline" size="sm" className="gap-1">
              <Mail className="h-4 w-4" /> Email Supplier List
            </Button>
          </Link>
        </div>
      </div>

      {/* P&L Dashboard Visual */}
      <Card>
        <CardContent className="pt-6">
          <PLDashboard
            totalIncome={totalIncome}
            totalCosts={totalCosts}
            profit={profit}
            incomeTarget={Number(finance?.incomeTarget || 0)}
            costTarget={Number(finance?.costTarget || 0)}
            profitTarget={Number(finance?.profitTarget || 0)}
            estimatedCosts={estimatedCosts}
            finalTakings={finance?.finalTakings != null ? Number(finance.finalTakings) : null}
            isCompleted={isCompleted}
          />
        </CardContent>
      </Card>

      {/* Targets */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target className="h-5 w-5" /> Set Targets
          </h2>
          <form action={saveTargets} className="space-y-4">
            <input type="hidden" name="eventId" value={id} />
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Income Target (£)"
                name="incomeTarget"
                type="number"
                step="0.01"
                defaultValue={finance?.incomeTarget ? Number(finance.incomeTarget) : ""}
                placeholder="0.00"
              />
              <Input
                label="Cost Budget (£)"
                name="costTarget"
                type="number"
                step="0.01"
                defaultValue={finance?.costTarget ? Number(finance.costTarget) : ""}
                placeholder="0.00"
              />
              <Input
                label="Profit Target (£)"
                name="profitTarget"
                type="number"
                step="0.01"
                defaultValue={finance?.profitTarget ? Number(finance.profitTarget) : ""}
                placeholder="0.00"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm">Save Targets</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Income Lines ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-green-800">Income Lines</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add new */}
            <form action={addIncomeLine} className="space-y-3 pb-4 border-b border-gray-100">
              <input type="hidden" name="eventId" value={id} />
              <input type="hidden" name="estimated" value="0" />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select name="category" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {INCOME_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Label" name="label" required placeholder="e.g. Early Bird Tickets" />
                <Input label="Amount (£)" name="actual" type="number" step="0.01" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Supplier (optional)</label>
                <SearchableSelect
                  name="organisationId"
                  placeholder="Search suppliers..."
                  options={suppliers.map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
              </div>
              <Button type="submit" size="sm" className="gap-1">
                <Plus className="h-3 w-3" /> Add Income
              </Button>
            </form>

            {/* List */}
            {event.incomeLines.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No income lines yet</p>
            ) : (
              <div className="space-y-2">
                {event.incomeLines.map((line) => (
                  <div key={line.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:bg-green-50/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{line.label}</p>
                      <p className="text-xs text-gray-500">
                        {INCOME_CATEGORIES.find((c) => c.value === line.category)?.label || line.category}
                        {line.organisation && (
                          <> · <Link href={`/crm/organisations`} className="text-indigo-600 hover:text-indigo-700 font-medium">{line.organisation.name}</Link></>
                        )}
                      </p>
                    </div>
                    <form action={updateIncomeLine} className="flex items-center gap-2 flex-shrink-0">
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="eventId" value={id} />
                      <span className="text-xs font-medium text-green-700">£</span>
                      <input
                        name="actual"
                        type="number"
                        step="0.01"
                        defaultValue={line.actual}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                      />
                      <Button type="submit" size="sm" variant="outline" className="text-xs h-7 px-2">
                        Save
                      </Button>
                    </form>
                    <form action={removeIncomeLine} className="flex-shrink-0">
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="eventId" value={id} />
                      <button type="submit" className="text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-200 flex justify-between text-sm font-semibold">
                  <span className="text-gray-700">Total Income</span>
                  <span className="text-green-700">£{totalIncome.toFixed(2)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Cost Lines ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-red-800">Cost Lines</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add new */}
            <form action={addCostLine} className="space-y-3 pb-4 border-b border-gray-100">
              <input type="hidden" name="eventId" value={id} />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select name="category" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {COST_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <Input label="Label" name="label" required placeholder="e.g. Main Hall Hire" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Estimated (£)" name="estimated" type="number" step="0.01" placeholder="0.00" />
                <Input label="Actual (£)" name="actual" type="number" step="0.01" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Supplier (optional)</label>
                <SearchableSelect
                  name="organisationId"
                  placeholder="Search suppliers..."
                  options={suppliers.map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
              </div>
              <Button type="submit" size="sm" className="gap-1">
                <Plus className="h-3 w-3" /> Add Cost
              </Button>
            </form>

            {/* List */}
            {event.costLines.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No cost lines yet</p>
            ) : (
              <div className="space-y-2">
                {event.costLines.map((line) => (
                  <div key={line.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:bg-red-50/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{line.label}</p>
                      <p className="text-xs text-gray-500">
                        {COST_CATEGORIES.find((c) => c.value === line.category)?.label || line.category}
                        {Number(line.estimated) > 0 && ` · Est: £${Number(line.estimated).toFixed(2)}`}
                        {line.organisation && (
                          <> · <Link href={`/crm/organisations`} className="text-indigo-600 hover:text-indigo-700 font-medium">{line.organisation.name}</Link></>
                        )}
                      </p>
                    </div>
                    <form action={updateCostLine} className="flex items-center gap-2 flex-shrink-0">
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="eventId" value={id} />
                      <span className="text-xs font-medium text-red-700">£</span>
                      <input
                        name="actual"
                        type="number"
                        step="0.01"
                        defaultValue={line.actual}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                      />
                      <Button type="submit" size="sm" variant="outline" className="text-xs h-7 px-2">
                        Save
                      </Button>
                    </form>
                    <form action={removeCostLine} className="flex-shrink-0">
                      <input type="hidden" name="id" value={line.id} />
                      <input type="hidden" name="eventId" value={id} />
                      <button type="submit" className="text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-200 flex justify-between text-sm font-semibold">
                  <span className="text-gray-700">Total Costs</span>
                  <span className="text-red-700">£{totalCosts.toFixed(2)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Complete Event */}
      {event.status !== "COMPLETED" && (
        <Card className="border-purple-200">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-purple-600" /> Complete Event
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Close out this event. Income and cost lines above are already tracked. If there was any additional income not yet recorded, add it here. You can still add income lines and assign donations after completion.
            </p>
            <form action={completeEvent} className="space-y-4">
              <input type="hidden" name="eventId" value={id} />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Additional Income (£)"
                  name="additionalIncome"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  defaultValue="0"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Completion Notes</label>
                  <textarea
                    name="notes"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Any notes about the event outcome..."
                  />
                </div>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 text-sm text-gray-600">
                <p>Current totals — <span className="font-medium text-green-700">Income: £{totalIncome.toFixed(2)}</span> · <span className="font-medium text-red-700">Costs: £{totalCosts.toFixed(2)}</span> · <span className="font-medium text-blue-700">Profit: £{profit.toFixed(2)}</span></p>
              </div>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700 gap-1">
                <CheckCircle2 className="h-4 w-4" /> Complete Event
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Completion Details */}
      {isCompleted && finance && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Event Completed
            </h2>
            <div className="mt-3 space-y-2 text-sm">
              {finance.finalTakings != null && Number(finance.finalTakings) > 0 && (
                <p><span className="font-medium text-gray-700">Additional Income at Completion:</span> £{Number(finance.finalTakings).toFixed(2)}</p>
              )}
              {finance.notes && (
                <p><span className="font-medium text-gray-700">Notes:</span> {finance.notes}</p>
              )}
              <p className="text-xs text-gray-500">
                {finance.completedAt && <>Completed on {formatDate(finance.completedAt)}</>}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save as Template */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Save className="h-5 w-5" /> Save as Template
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Save this event's financial structure as a reusable template for future events.
          </p>
          <form action={saveEventAsTemplate} className="space-y-3">
            <input type="hidden" name="eventId" value={id} />
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  label="Template Name"
                  name="templateName"
                  required
                  placeholder="e.g. Annual Fun Run Template"
                />
              </div>
              <Button type="submit" className="gap-1">
                <Save className="h-4 w-4" /> Save Template
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
