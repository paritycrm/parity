import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OpportunityForm } from "@/components/finance/opportunity-form";
import { notFound } from "next/navigation";

export default async function EditOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const opportunity = await prisma.donorOpportunity.findUnique({
    where: { id },
  });

  if (!opportunity) {
    notFound();
  }

  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
    where: { status: "ACTIVE" },
    orderBy: { lastName: "asc" },
    take: 200,
  });

  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      name: true,
    },
    where: { status: { in: ["ACTIVE", "DRAFT"] } },
    orderBy: { name: "asc" },
  });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
    },
    where: { role: { in: ["ADMIN", "STAFF"] } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/finance/pipeline/${id}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Opportunity
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit Opportunity</h1>
        <p className="text-gray-500 mt-1">{opportunity.name}</p>
      </div>

      <Card>
        <div className="p-6">
          <OpportunityForm
            contacts={contacts}
            campaigns={campaigns}
            users={users}
            initialData={opportunity}
          />
        </div>
      </Card>
    </div>
  );
}
