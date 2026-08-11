import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Radio, Plus, CheckCircle, HelpCircle, XCircle, Clock, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 50;

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const where = {};

  const [broadcasts, totalCount] = await Promise.all([
    prisma.broadcast.findMany({
      where,
      include: {
        department: true,
        skills: { include: { skill: true } },
        responses: true,
        createdBy: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.broadcast.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const paginationParams = {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Broadcasts</h1>
          <p className="text-gray-500 mt-1">{totalCount.toLocaleString()} broadcasts</p>
        </div>
        <Link href="/broadcasts/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Broadcast
          </Button>
        </Link>
      </div>

      {broadcasts.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No broadcasts yet"
          description="Create a broadcast when you need urgent volunteer cover."
          actionLabel="New Broadcast"
          actionHref="/broadcasts/new"
        />
      ) : (
        <>
          <div className="space-y-4">
            {broadcasts.map((b) => {
              const accepted = b.responses.filter((r) => r.response === "ACCEPTED").length;
              const declined = b.responses.filter((r) => r.response === "DECLINED").length;
              const tentative = b.responses.filter((r) => r.response === "TENTATIVE").length;
              const confirmed = b.responses.filter((r) => r.confirmedAt).length;
              // accepted already includes confirmed (confirmed is a subset of accepted)
              const filled = accepted;
              const needed = b.maxRespondents;
              const remaining = Math.max(0, needed - filled);
              const pct = Math.min(100, Math.round((filled / needed) * 100));
              const isAllFilled = filled >= needed;
              const isCancelled = b.status === "CANCELLED";
              const isExpired = new Date(b.expiresAt) < new Date() && b.status === "OPEN";

              // Colour logic: red = 0 replies, amber = partial, green = full
              const gradient = isCancelled
                ? "from-gray-400 to-gray-500"
                : isAllFilled
                ? "from-green-500 to-emerald-600"
                : filled > 0
                ? "from-amber-500 to-orange-600"
                : "from-red-500 to-rose-600";

              const urgencyRing = b.urgency === "CRITICAL"
                ? "ring-2 ring-red-500 ring-offset-2"
                : b.urgency === "HIGH"
                ? "ring-2 ring-amber-400 ring-offset-2"
                : "";

              return (
                <Link key={b.id} href={`/broadcasts/${b.id}`}>
                  <div className={`rounded-2xl overflow-hidden bg-gradient-to-r ${gradient} text-white shadow-lg hover:shadow-xl transition-all cursor-pointer mb-4 ${urgencyRing}`}>
                    <div className="flex items-stretch">
                      {/* Left: Big number */}
                      <div className="flex flex-col items-center justify-center px-8 py-6 bg-black/10 min-w-[120px]">
                        <div className="text-5xl font-black tabular-nums leading-none">
                          {filled}
                        </div>
                        <div className="text-lg font-bold text-white/50 -mt-1">
                          /{needed}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-white/60 mt-2 font-semibold">
                          {isAllFilled ? "Filled" : isCancelled ? "Cancelled" : "Filled"}
                        </div>
                      </div>

                      {/* Middle: Details */}
                      <div className="flex-1 px-6 py-5">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-lg font-bold">{b.title}</h3>
                          {b.urgency === "CRITICAL" && (
                            <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                              URGENT
                            </span>
                          )}
                          {b.urgency === "HIGH" && (
                            <span className="text-xs font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">
                              HIGH
                            </span>
                          )}
                          {isCancelled && (
                            <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">CANCELLED</span>
                          )}
                          {isExpired && (
                            <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">EXPIRED</span>
                          )}
                        </div>
                        <p className="text-white/80 text-sm line-clamp-1">{b.message}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-white/60">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {b.targetDate} • {b.targetStartTime}–{b.targetEndTime}
                          </span>
                          {b.department && <span>{b.department.name}</span>}
                        </div>
                        {b.skills.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {b.skills.map((bs) => (
                              <span key={bs.skillId} className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full font-medium">
                                {bs.skill.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Progress bar */}
                        {!isCancelled && (
                          <div className="mt-3 w-full bg-white/20 rounded-full h-2.5 overflow-hidden">
                            <div
                              className="bg-white h-2.5 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Right: Status callout */}
                      <div className="flex flex-col items-center justify-center px-6 py-5 min-w-[160px]">
                        {isAllFilled ? (
                          <div className="text-center">
                            <CheckCircle className="h-8 w-8 mx-auto mb-1" />
                            <p className="text-sm font-bold">All Filled</p>
                          </div>
                        ) : isCancelled ? (
                          <div className="text-center">
                            <XCircle className="h-8 w-8 mx-auto mb-1 text-white/60" />
                            <p className="text-sm font-bold text-white/60">Cancelled</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="text-3xl font-black">{remaining}</p>
                            <p className="text-xs font-bold uppercase tracking-wider text-white/70">
                              {remaining === 1 ? "spot left" : "spots left"}
                            </p>
                            {/* Response breakdown */}
                            <div className="flex gap-2 mt-2 text-[10px]">
                              {accepted > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <CheckCircle className="h-3 w-3" />{accepted}
                                </span>
                              )}
                              {tentative > 0 && (
                                <span className="flex items-center gap-0.5 text-white/60">
                                  <HelpCircle className="h-3 w-3" />{tentative}
                                </span>
                              )}
                              {declined > 0 && (
                                <span className="flex items-center gap-0.5 text-white/40">
                                  <XCircle className="h-3 w-3" />{declined}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Chevron */}
                      <div className="flex items-center pr-4">
                        <ChevronRight className="h-5 w-5 text-white/40" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            baseUrl="/broadcasts"
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            searchParams={paginationParams}
          />
        </>
      )}
    </div>
  );
}
