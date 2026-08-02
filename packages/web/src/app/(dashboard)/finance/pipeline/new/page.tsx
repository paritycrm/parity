import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { OpportunityForm } from "@/components/finance/opportunity-form";

export default async function NewOpportunityPage() {
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
        <h1 className="text-2xl font-bold text-gray-900">New Opportunity</h1>
        <p className="text-gray-500 mt-1">Create a new donor opportunity</p>
      </div>

      <Card>
        <div className="p-6">
          <OpportunityForm
            contacts={contacts}
            campaigns={campaigns}
            users={users}
          />
        </div>
      </Card>
    </div>
  );
}
