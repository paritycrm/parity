import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import Link from "next/link";
import { ArrowLeft, PoundSterling, Heart } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function EventOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      registrationForm: true,
      orders: {
        include: {
          contact: true,
          lineItems: { include: { item: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!event) notFound();

  const orders = event.orders || [];
  const totalRevenue = orders
    .filter((o) => o.paymentStatus === "PAID" || o.paymentStatus === "FREE")
    .reduce((s, o) => s + Number(o.totalAmount), 0);
  const totalGiftAid = orders
    .filter((o) => o.giftAidDeclared)
    .reduce((s, o) => s + Number(o.giftAidTotal) * 0.25, 0);

  const paymentStatusColors: Record<string, string> = {
    PAID: "bg-green-100 text-green-800",
    FREE: "bg-blue-100 text-blue-800",
    UNPAID: "bg-yellow-100 text-yellow-800",
    REFUNDED: "bg-red-100 text-red-800",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/events/${id}/registration`}
          className="text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registrations</h1>
          <p className="text-sm text-gray-500">{event.name}</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-indigo-600">{orders.length}</p>
            <p className="text-sm text-gray-500 mt-1">Total Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">
              £{totalRevenue.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500 mt-1">Total Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-amber-600">
              £{totalGiftAid.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500 mt-1">Gift Aid Claimable</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-purple-600">
              {orders.filter((o) => o.giftAidDeclared).length}
            </p>
            <p className="text-sm text-gray-500 mt-1">Gift Aid Declarations</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders table */}
      <Card>
        <CardContent className="pt-6">
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No registrations yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500 uppercase text-xs">
                    <th className="pb-3 pr-4">Order</th>
                    <th className="pb-3 pr-4">Attendee</th>
                    <th className="pb-3 pr-4">Items</th>
                    <th className="pb-3 pr-4">Amount</th>
                    <th className="pb-3 pr-4">Gift Aid</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-100">
                      <td className="py-3 pr-4">
                        <p className="font-mono text-xs text-gray-600">
                          {order.orderNumber}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/crm/contacts/${order.contactId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {order.attendeeName}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {order.attendeeEmail}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="text-xs text-gray-600">
                          {order.lineItems.map((li) => (
                            <div key={li.id}>
                              {li.item.name}
                              {li.quantity > 1 ? ` x${li.quantity}` : ""}
                              {li.variant ? ` (${li.variant})` : ""}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        £{Number(order.totalAmount).toFixed(2)}
                      </td>
                      <td className="py-3 pr-4">
                        {order.giftAidDeclared ? (
                          <span className="text-amber-700 flex items-center gap-1">
                            <Heart className="h-3 w-3" />£
                            {(Number(order.giftAidTotal) * 0.25).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          className={
                            paymentStatusColors[order.paymentStatus] || ""
                          }
                        >
                          {order.paymentStatus}
                        </Badge>
                      </td>
                      <td className="py-3 text-gray-500">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
