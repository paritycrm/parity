/**
 * One-time migration: Create Organisation records for existing grant funders
 * and link them via funderId.
 *
 * Usage (from packages/web):
 *   DATABASE_URL="postgresql://..." npx tsx prisma/migrate-funders.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Ensure the Funder role exists
  let funderRole = await prisma.organisationRole.findUnique({
    where: { name: "Funder" },
  });
  if (!funderRole) {
    funderRole = await prisma.organisationRole.create({
      data: { name: "Funder", colour: "#d97706", isSystem: true },
    });
    console.log("Created Funder role");
  }

  // Find all grants with a funderName but no funderId
  const unlinkedGrants = await prisma.grant.findMany({
    where: { funderId: null, funderName: { not: "" } },
    select: { id: true, funderName: true },
  });

  // Group by funder name
  const funderNames = [...new Set(unlinkedGrants.map((g) => g.funderName))];
  console.log(`Found ${funderNames.length} unlinked funder name(s): ${funderNames.join(", ")}`);

  for (const name of funderNames) {
    // Check if org already exists
    let org = await prisma.organisation.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });

    if (!org) {
      org = await prisma.organisation.create({
        data: { name },
      });
      console.log(`Created organisation: ${name}`);
    } else {
      console.log(`Organisation already exists: ${name}`);
    }

    // Ensure Funder role is assigned
    const hasRole = await prisma.organisationRoleAssignment.findUnique({
      where: {
        organisationId_roleId: {
          organisationId: org.id,
          roleId: funderRole.id,
        },
      },
    });
    if (!hasRole) {
      await prisma.organisationRoleAssignment.create({
        data: { organisationId: org.id, roleId: funderRole.id },
      });
      console.log(`  Assigned Funder role to ${name}`);
    }

    // Link grants to this org
    const grants = unlinkedGrants.filter((g) => g.funderName === name);
    await prisma.grant.updateMany({
      where: { id: { in: grants.map((g) => g.id) } },
      data: { funderId: org.id },
    });
    console.log(`  Linked ${grants.length} grant(s) to ${name}`);
  }

  console.log("Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
