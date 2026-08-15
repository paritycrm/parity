import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail, Clock, CheckCircle, XCircle, ArrowLeft, Users, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 25;

// Parse the notification body to extract sent/failed counts
// Body format: "Sent to X recipients (Y failed)"
function parseCampaignStats(body: string): { sent: number; failed: number } {
  const sentMatch = body.match(/Sent to (\d+) recipient/);
  const failedMatch = body.match(/\((\d+) failed\)/);
  return {
    sent: sentMatch ? parseInt(sentMatch[1], 10) : 0,
    failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
  };
}

// Extract the subject from the notification title
// Title format: 'Email sent: "Subject here"'
function parseSubject(title: string): string {
  const match = title.match(/Email sent: "(.+)"$/);
  return match ? match[1] : title;
}

export default async function EmailHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session || !["ADMIN", "STAFF"].includes(session.role)) redirect("/login");

  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const where = {
    type: "EMAIL_CAMPAIGN",
  };

  const [campaigns, totalCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: {
        recipient: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notification.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/communications/email" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-6 w-6" /> Email Campaign History
          </h1>
          <p className="text-gray-500 mt-1">
            {totalCount} campaign{totalCount !== 1 ? "s" : ""} sent
          </p>
        </div>
        <Link href="/communications/email">
          <Button variant="outline" className="gap-2">
            <Send className="h-4 w-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No campaigns sent yet"
          description="Once you send an email campaign, it will appear here."
          actionLabel="Compose Email"
          actionHref="/communications/email"
        />
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Subject
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Sent By
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Date
                    </th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Recipients
                    </th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaigns.map((c) => {
                    const subject = parseSubject(c.title);
                    const { sent, failed } = parseCampaignStats(c.body);
                    const total = sent + failed;
                    const allSucceeded = failed === 0;
                    const sentAt = c.sentAt || c.createdAt;

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[300px]">
                              {subject}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-gray-600">
                            {c.recipient?.name || "Unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-gray-600">
                            {new Date(sentAt).toLocaleString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                            <Users className="h-3.5 w-3.5 text-gray-400" />
                            {total}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {sent > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                                <CheckCircle className="h-3 w-3" />
                                {sent} sent
                              </span>
                            )}
                            {failed > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full">
                                <XCircle className="h-3 w-3" />
                                {failed} failed
                              </span>
                            )}
                            {total === 0 && (
                              <span className="text-xs text-gray-400">--</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/communications/email/history"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={{}}
          />
        </>
      )}
    </div>
  );
}
