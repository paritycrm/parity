import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { requireAuth } from "@/lib/session";

export default async function BankDocumentsPage() {
  await requireAuth();

  const bankDocs = await prisma.bankDocument.findMany({
    include: {
      createdBy: true,
      donations: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const statusColors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-800",
    CLOSED: "bg-green-100 text-green-800",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bank Documents</h1>
        <p className="text-gray-500 mt-1">Bank documents are created automatically when you record donations. View and edit donation lines here.</p>
      </div>

      {bankDocs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No bank documents yet"
          description="Bank documents will appear here automatically when you record donations via Finance → Donations → Add Donation."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bankDocs.map((doc) => {
                  const total = doc.donations.reduce((sum, d) => sum + Number(d.amount), 0);
                  return (
                    <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <Link href={`/finance/bank-documents/${doc.id}`} className="font-medium text-indigo-600 hover:text-indigo-700">
                          {doc.reference}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(doc.date)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{doc.donations.length}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">£{total.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <Badge className={statusColors[doc.status] || "bg-gray-100 text-gray-800"}>{doc.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{doc.createdBy.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
