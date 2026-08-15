import { formatDate, formatShortDate } from '@/lib/utils';
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getHomeForRole } from "@/lib/route-guard";
import {
  Users,
  UserCheck,
  Radio,
  PoundSterling,
  Heart,
  Calendar,
  Clock,
  TrendingUp,
  Package,
  AlertTriangle,
  ArrowUpRight,
  Ticket,
  Phone,
  Mail,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStatusColor } from "@/lib/utils";
import Link from "next/link";
import {
  DonationsChart,
  DonationTypePie,
  VolunteerHoursChart,
} from "@/components/ui/dashboard-charts";
import { DashboardDateFilter } from "@/components/ui/dashboard-date-filter";

function getMonthLabel(date: Date): string {
  return formatShortDate(date);
}

function getMonthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    months.push(getMonthLabel(d));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

function getDateRange(range: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (range) {
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case "custom": {
      if (from && to) {
        return {
          start: new Date(from + "T00:00:00"),
          end: new Date(to + "T23:59:59.999"),
        };
      }
      // fallback to YTD
      return { start: new Date(now.getFullYear(), 0, 1), end };
    }
    case "ytd":
    default:
      return { start: new Date(now.getFullYear(), 0, 1), end };
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["ADMIN", "STAFF"].includes(session.role)) {
    redirect(getHomeForRole(session.role));
  }

  const params = await searchParams;
  const range = params.range || "ytd";
  const { start: filterStart, end: filterEnd } = getDateRange(range, params.from, params.to);

  // For charts we always want a sensible month range
  const chartMonths = getMonthsBetween(filterStart, filterEnd);
  // If range is too short for meaningful chart, extend to at least cover the period
  const chartStart = new Date(filterStart);

  // ── Queries ─────────────────────────────────────────────────

  let contactCount = 0;
  let volunteerCount = 0;
  let activeVolunteers = 0;
  let openBroadcasts = 0;
  let lotteryMembers = 0;
  // Static — always full year
  let totalDonationsThisYear: any = { _sum: { amount: 0 }, _count: 0 };
  let activeGiftAidDeclarations = 0;
  let giftAidableUnclaimed: any = { _sum: { amount: 0 } };
  // Date-filtered
  let filteredVolunteerHours: any = { _sum: { hours: 0 } };
  let filteredTinCollections: any = { _sum: { amount: 0 }, _count: 0 };
  let donationsInRange: any[] = [];
  let donationsByType: any[] = [];
  let volunteerHoursInRange: any[] = [];
  let deployedTins = 0;
  let totalTins = 0;
  let upcomingEvents: any[] = [];
  let activeCampaigns: any[] = [];
  let recentDonations: any[] = [];
  let recentBroadcasts: any[] = [];
  let upcomingAssignments: any[] = [];
  let contactsWithPhone = 0;
  let contactsWithEmail = 0;

  try {
    [
      contactCount,
      volunteerCount,
      activeVolunteers,
      openBroadcasts,
      lotteryMembers,
      // Static
      totalDonationsThisYear,
      activeGiftAidDeclarations,
      giftAidableUnclaimed,
      // Date-filtered
      filteredVolunteerHours,
      filteredTinCollections,
      donationsInRange,
      donationsByType,
      volunteerHoursInRange,
      deployedTins,
      totalTins,
      upcomingEvents,
      activeCampaigns,
      recentDonations,
      recentBroadcasts,
      upcomingAssignments,
      contactsWithPhone,
      contactsWithEmail,
    ] = await Promise.all([
      // ── Always-current counts ────────────────────────────
      prisma.contact.count(),
      prisma.volunteerProfile.count(),
      prisma.volunteerProfile.count({ where: { status: "ACTIVE" } }),
      prisma.broadcast.count({ where: { status: "OPEN" } }),
      prisma.contact.count({ where: { isLotteryMember: true } }),

      // ── Static: Donations this calendar year ─────────────
      prisma.donation.aggregate({
        _sum: { amount: true },
        _count: true,
        where: {
          date: { gte: new Date(new Date().getFullYear(), 0, 1) },
          status: { in: ["RECEIVED", "PENDING"] },
        },
      }),

      // ── Static: Gift Aid (unclaimed to date) ─────────────
      // Count active declarations
      prisma.giftAid.count({ where: { status: "ACTIVE" } }),
      // Find unclaimed donation total from contacts with active declarations
      // First get contact IDs, then aggregate their donations
      prisma.giftAid.findMany({
        where: { status: "ACTIVE" },
        select: { contactId: true },
        distinct: ["contactId"],
      }).then(async (decls) => {
        const contactIds = decls.map((d) => d.contactId);
        if (contactIds.length === 0) return { _sum: { amount: 0 } };
        return prisma.donation.aggregate({
          _sum: { amount: true },
          where: {
            contactId: { in: contactIds },
            giftAidClaimed: false,
            status: "RECEIVED",
            type: { notIn: ["IN_KIND", "GRANT", "LEGACY"] },
          },
        });
      }),

      // ── Date-filtered: Volunteer hours in range ──────────
      prisma.volunteerHoursLog.aggregate({
        _sum: { hours: true },
        where: {
          createdAt: { gte: filterStart, lte: filterEnd },
        },
      }),

      // ── Date-filtered: Tin collections in range ──────────
      prisma.collectionTinMovement.aggregate({
        _sum: { amount: true },
        _count: true,
        where: {
          type: "COUNTED",
          amount: { not: null },
          date: { gte: filterStart, lte: filterEnd },
        },
      }),

      // ── Date-filtered: Donations in range (for charts) ──
      prisma.donation.findMany({
        where: {
          date: { gte: chartStart, lte: filterEnd },
          status: { in: ["RECEIVED", "PENDING"] },
        },
        select: { amount: true, date: true, isGiftAidable: true },
      }),

      // ── Date-filtered: Donations by type in range ────────
      prisma.donation.groupBy({
        by: ["type"],
        _sum: { amount: true },
        where: {
          date: { gte: filterStart, lte: filterEnd },
          status: { in: ["RECEIVED", "PENDING"] },
        },
      }),

      // ── Date-filtered: Volunteer hours in range (charts) ─
      prisma.volunteerHoursLog.findMany({
        where: {
          createdAt: { gte: chartStart, lte: filterEnd },
        },
        select: { hours: true, createdAt: true },
      }),

      // ── Always-current ───────────────────────────────────
      prisma.collectionTin.count({ where: { status: "DEPLOYED" } }),
      prisma.collectionTin.count(),

      // Upcoming events
      prisma.event.findMany({
        where: {
          startDate: { gte: new Date() },
          status: { in: ["PLANNED", "OPEN"] },
        },
        orderBy: { startDate: "asc" },
        take: 5,
        include: { _count: { select: { attendees: true } } },
      }),

      // Active campaigns
      prisma.campaign.findMany({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Recent donations
      prisma.donation.findMany({
        orderBy: { date: "desc" },
        take: 5,
        include: { contact: true },
      }),

      // Recent Broadcasts
      prisma.broadcast.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { department: true, responses: true },
      }),

      // Upcoming Assignments
      prisma.assignment.findMany({
        where: { status: { in: ["SCHEDULED", "CONFIRMED"] } },
        orderBy: { date: "asc" },
        take: 5,
        include: {
          volunteer: { include: { contact: true } },
          department: true,
        },
      }),

      // Contact data capture stats
      prisma.contact.count({
        where: { status: "ACTIVE", phone: { not: null }, NOT: { phone: "" } },
      }),
      prisma.contact.count({
        where: { status: "ACTIVE", email: { not: null }, NOT: { email: "" } },
      }),
    ]);
  } catch (err) {
    console.error("Dashboard data fetch error:", err);
  }

  // ── Process chart data ────────────────────────────────────

  const monthlyMap: Record<string, { total: number; giftAid: number; count: number }> = {};
  chartMonths.forEach((m) => (monthlyMap[m] = { total: 0, giftAid: 0, count: 0 }));
  donationsInRange.forEach((d) => {
    const label = getMonthLabel(new Date(d.date));
    if (monthlyMap[label]) {
      monthlyMap[label].total += Number(d.amount);
      if (d.isGiftAidable) monthlyMap[label].giftAid += Number(d.amount) * 0.25;
      monthlyMap[label].count += 1;
    }
  });
  const monthlyDonationData = chartMonths.map((m) => ({
    month: m,
    total: Math.round((monthlyMap[m]?.total || 0) * 100) / 100,
    giftAid: Math.round((monthlyMap[m]?.giftAid || 0) * 100) / 100,
    count: monthlyMap[m]?.count || 0,
  }));

  const typeLabels: Record<string, string> = {
    DONATION: "Donations",
    PAYMENT: "Payments",
    GIFT: "Gifts",
    EVENT_FEE: "Event Fees",
    SPONSORSHIP: "Sponsorship",
    LEGACY: "Legacy",
    GRANT: "Grants",
    IN_KIND: "In Kind",
  };
  const donationTypeData = donationsByType.map((d) => ({
    name: typeLabels[d.type] || d.type,
    value: Number(d._sum.amount || 0),
  }));

  const hoursMap: Record<string, number> = {};
  chartMonths.forEach((m) => (hoursMap[m] = 0));
  volunteerHoursInRange.forEach((h) => {
    const label = getMonthLabel(new Date(h.createdAt));
    if (hoursMap[label] !== undefined) {
      hoursMap[label] += h.hours;
    }
  });
  const monthlyHoursData = chartMonths.map((m) => ({
    month: m,
    hours: Math.round((hoursMap[m] || 0) * 10) / 10,
  }));

  // ── Computed values ───────────────────────────────────────

  const totalDonationsAmount = Number(totalDonationsThisYear._sum.amount || 0);
  const totalDonationsCount = totalDonationsThisYear._count || 0;
  const unclaimedGiftAid = Number(giftAidableUnclaimed._sum.amount || 0) * 0.25;
  const totalVolunteerHours = Number(filteredVolunteerHours._sum.hours || 0);
  const tinCollections = Number(filteredTinCollections._sum.amount || 0);
  const activeContactCount = await prisma.contact.count({ where: { status: "ACTIVE" } });
  const phonePct = activeContactCount > 0 ? Math.round((contactsWithPhone / activeContactCount) * 100) : 0;
  const emailPct = activeContactCount > 0 ? Math.round((contactsWithEmail / activeContactCount) * 100) : 0;
  const missingPhone = activeContactCount - contactsWithPhone;
  const missingEmail = activeContactCount - contactsWithEmail;

  // ── Range label for filtered cards ────────────────────────
  return (
    <div className="space-y-6">
      {/* Header with date filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Welcome back, {session?.name}</p>
        </div>
        <DashboardDateFilter />
      </div>

      {/* Static Stats Row — not affected by date filter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Donations This Year"
          value={`£${totalDonationsAmount.toFixed(2)}`}
          icon={PoundSterling}
          trend={`${totalDonationsCount} donations`}
          trendUp={true}
          href="/finance/donations"
        />
        <StatCard
          title="Gift Aid Claimable"
          value={`£${unclaimedGiftAid.toFixed(2)}`}
          icon={Heart}
          trend={`${activeGiftAidDeclarations} active · resets on claim`}
          trendUp={true}
          href="/finance/gift-aid"
        />
        <StatCard
          title={`Volunteer Hours`}
          value={`${totalVolunteerHours.toFixed(0)} hrs`}
          icon={Clock}
          trend={`${activeVolunteers} active volunteers`}
          trendUp={true}
          href="/volunteers/hours"
        />
        <StatCard
          title={`Tin Collections`}
          value={`£${tinCollections.toFixed(2)}`}
          icon={Package}
          trend={`${deployedTins}/${totalTins} deployed`}
          trendUp={true}
          href="/finance/collection-tins"
        />
      </div>

      {/* Counts Row — always current */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Contacts" value={contactCount} icon={Users} href="/crm/contacts" />
        <StatCard title="Volunteers" value={volunteerCount} icon={UserCheck} href="/volunteers" />
        <StatCard title="Lottery Members" value={lotteryMembers} icon={Ticket} href="/crm/contacts?lottery=yes" />
        <StatCard title="Open Broadcasts" value={openBroadcasts} icon={Radio} href="/broadcasts" />
        <StatCard
          title="Upcoming Events"
          value={upcomingEvents.length}
          icon={Calendar}
          href="/events"
        />
      </div>

      {/* Data Capture */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: "/crm/contacts?missing=phone", icon: Phone, label: "Phone", count: contactsWithPhone, total: activeContactCount, pct: phonePct, missing: missingPhone, missingLabel: "phone number" },
          { href: "/crm/contacts?missing=email", icon: Mail, label: "Email", count: contactsWithEmail, total: activeContactCount, pct: emailPct, missing: missingEmail, missingLabel: "email" },
        ].map((item) => {
          const color = item.pct === 100 ? "#16a34a" : item.pct >= 75 ? "#d97706" : "#dc2626";
          const textColor = item.pct === 100 ? "text-green-600" : item.pct >= 75 ? "text-amber-600" : "text-red-600";
          return (
            <Link key={item.label} href={item.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5 font-medium">
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label} Capture
                  </p>
                  <div className="relative h-20 w-20">
                    <svg viewBox="0 0 36 36" className="h-20 w-20 transform -rotate-90">
                      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                      <circle cx="18" cy="18" r="15.9155" fill="none"
                        stroke={color}
                        strokeWidth="2.5" strokeDasharray={`${item.pct} ${100 - item.pct}`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-lg font-bold leading-none ${textColor}`}>{item.pct}%</span>
                      <span className="text-[10px] text-gray-500 leading-tight mt-0.5">{item.count}/{item.total}</span>
                    </div>
                  </div>
                  {item.missing > 0 && (
                    <p className="text-[11px] text-indigo-600 font-medium leading-tight">
                      {item.missing} missing →
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Charts Row — date filtered */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Donations & Gift Aid
              </h2>
              <Link
                href="/finance/donations"
                className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <DonationsChart data={monthlyDonationData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Income Breakdown
            </h2>
          </CardHeader>
          <CardContent>
            <DonationTypePie data={donationTypeData} />
          </CardContent>
        </Card>
      </div>

      {/* Volunteer Hours Chart + Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Volunteer Hours
              </h2>
              <Link
                href="/volunteers/hours"
                className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <VolunteerHoursChart data={monthlyHoursData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Active Campaigns
              </h2>
              <Link
                href="/campaigns"
                className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activeCampaigns.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">
                No active campaigns
              </p>
            ) : (
              <div className="space-y-3">
                {activeCampaigns.map((campaign) => {
                  const progress =
                    campaign.budgetTarget && Number(campaign.budgetTarget) > 0
                      ? Math.min(
                          (Number(campaign.actualRaised) / Number(campaign.budgetTarget)) * 100,
                          100
                        )
                      : 0;
                  return (
                    <Link
                      key={campaign.id}
                      href={`/campaigns/${campaign.id}`}
                      className="block p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900">
                          {campaign.name}
                        </p>
                        {campaign.budgetTarget ? (
                          <span className="text-xs text-gray-500">
                            £{Number(campaign.actualRaised).toFixed(0)} / £
                            {Number(campaign.budgetTarget).toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">
                            £{Number(campaign.actualRaised).toFixed(0)}
                          </span>
                        )}
                      </div>
                      {campaign.budgetTarget && Number(campaign.budgetTarget) > 0 && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-600 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Events</h2>
              <Link href="/events" className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No upcoming events</p>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <Link key={event.id} href={`/events/${event.id}`} className="flex items-center justify-between py-2 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{event.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(event.startDate)}
                        {event.location ? ` · ${event.location}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(event.status)}>{event.status}</Badge>
                      <p className="text-xs text-gray-500 mt-1">{event._count.attendees} attendees</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Donations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Donations</h2>
              <Link href="/finance/donations" className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentDonations.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No donations yet</p>
            ) : (
              <div className="space-y-3">
                {recentDonations.map((donation) => (
                  <Link key={donation.id} href={`/crm/contacts/${donation.contactId}`} className="flex items-center justify-between py-2 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{donation.contact.firstName} {donation.contact.lastName}</p>
                      <p className="text-xs text-gray-500">{formatDate(donation.date)} · {donation.type.replace("_", " ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">£{Number(donation.amount).toFixed(2)}</p>
                      {donation.isGiftAidable && <span className="text-xs text-amber-600">+Gift Aid</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Broadcasts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Broadcasts</h2>
              <Link href="/broadcasts" className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentBroadcasts.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No broadcasts yet</p>
            ) : (
              <div className="space-y-3">
                {recentBroadcasts.map((broadcast) => (
                  <Link key={broadcast.id} href={`/broadcasts/${broadcast.id}`} className="flex items-center justify-between py-2 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{broadcast.title}</p>
                      <p className="text-xs text-gray-500">{broadcast.department?.name} · {broadcast.responses.length} responses</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(broadcast.urgency)}>{broadcast.urgency}</Badge>
                      <Badge className={getStatusColor(broadcast.status)}>{broadcast.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Assignments */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Assignments</h2>
              <Link href="/assignments" className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                View all <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingAssignments.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No upcoming assignments</p>
            ) : (
              <div className="space-y-3">
                {upcomingAssignments.map((assignment) => (
                  <Link key={assignment.id} href={`/volunteers/${assignment.volunteer.id}`} className="flex items-center justify-between py-2 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{assignment.title}</p>
                      <p className="text-xs text-gray-500">
                        {assignment.volunteer.contact.firstName} {assignment.volunteer.contact.lastName} · {assignment.department.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">{assignment.date}</p>
                      <p className="text-xs text-gray-500">{assignment.startTime} - {assignment.endTime}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
