import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { guardRoute } from "@/lib/route-guard";
import { Sidebar } from "@/components/shared/sidebar";
import { TopBar } from "@/components/shared/top-bar";
import { BrandingProvider } from "@/components/shared/branding-provider";
import { loadBranding, adjustColour } from "@/lib/branding";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Check if user's role can access the current route
  const headersList = await headers();
  const pathname = headersList.get("x-next-pathname") || headersList.get("x-invoke-path") || "";

  // guardRoute will redirect if access denied — redirect() throws NEXT_REDIRECT
  if (pathname) {
    guardRoute(session, pathname);
  }

  // Count unread notifications + pending reminders for the bell badge
  const [unreadNotifications, pendingReminders] = await Promise.all([
    prisma.notification.count({
      where: { recipientId: session.id, readAt: null },
    }),
    prisma.reminder.count({
      where: { isSent: false, triggerDate: { lte: new Date() } },
    }),
  ]);
  const notificationCount = unreadNotifications + pendingReminders;

  // Load white-label branding
  const branding = await loadBranding();
  const brandingValues = {
    ...branding,
    primaryColourHover: adjustColour(branding.primaryColour, -10),
  };

  return (
    <BrandingProvider branding={brandingValues}>
      <div className="flex h-screen bg-gray-50">
        <Sidebar userRole={session.role} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar user={session} notificationCount={notificationCount} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </BrandingProvider>
  );
}
