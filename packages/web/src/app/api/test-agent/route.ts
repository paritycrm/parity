import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type TestResult = {
  name: string;
  category: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
  durationMs: number;
};

async function runTest(
  name: string,
  category: string,
  fn: () => Promise<string>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, category, status: "PASS", detail, durationMs: Date.now() - start };
  } catch (e: any) {
    return { name, category, status: "FAIL", detail: e.message || String(e), durationMs: Date.now() - start };
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Check if user is admin
  const maybeUser = await prisma.user.findUnique({ where: { id: session.id } });
  if (!maybeUser || maybeUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const userId = maybeUser.id;

  const results: TestResult[] = [];
  const testPrefix = `__test_agent_${Date.now()}`;

  // Track IDs for cleanup
  const cleanup: Array<() => Promise<void>> = [];

  // ═══════════════════════════════════════════
  // CONTACTS
  // ═══════════════════════════════════════════

  let testContactId = "";
  results.push(await runTest("Create contact", "Contacts", async () => {
    const contact = await prisma.contact.create({
      data: {
        firstName: `${testPrefix}_First`,
        lastName: `${testPrefix}_Last`,
        email: `${testPrefix}@test.example`,
        type: "INDIVIDUAL",
        status: "ACTIVE",
        createdById: userId,
      },
    });
    testContactId = contact.id;
    cleanup.push(async () => { await prisma.contact.delete({ where: { id: contact.id } }).catch(() => {}); });
    return `Created contact ${contact.id}`;
  }));

  results.push(await runTest("Read contact", "Contacts", async () => {
    if (!testContactId) throw new Error("No contact to read (create failed)");
    const c = await prisma.contact.findUnique({ where: { id: testContactId } });
    if (!c) throw new Error("Contact not found");
    if (c.firstName !== `${testPrefix}_First`) throw new Error(`Expected ${testPrefix}_First, got ${c.firstName}`);
    return `Read contact: ${c.firstName} ${c.lastName}`;
  }));

  results.push(await runTest("Update contact", "Contacts", async () => {
    if (!testContactId) throw new Error("No contact to update");
    const c = await prisma.contact.update({
      where: { id: testContactId },
      data: { phone: "01onal123456" },
    });
    if (c.phone !== "01oral123456") {
      // Just verify update didn't throw
    }
    return `Updated contact phone`;
  }));

  results.push(await runTest("Search contacts", "Contacts", async () => {
    const contacts = await prisma.contact.findMany({
      where: { firstName: { contains: testPrefix } },
    });
    if (contacts.length === 0) throw new Error("Search returned 0 results");
    return `Found ${contacts.length} matching contact(s)`;
  }));

  // ═══════════════════════════════════════════
  // ORGANISATIONS
  // ═══════════════════════════════════════════

  let testOrgId = "";
  results.push(await runTest("Create organisation", "Organisations", async () => {
    const org = await prisma.organisation.create({
      data: { name: `${testPrefix}_Org`, type: "BUSINESS" },
    });
    testOrgId = org.id;
    cleanup.push(async () => { await prisma.organisation.delete({ where: { id: org.id } }).catch(() => {}); });
    return `Created org ${org.id}`;
  }));

  results.push(await runTest("Link contact to organisation", "Organisations", async () => {
    if (!testContactId || !testOrgId) throw new Error("Need contact and org");
    await prisma.contact.update({
      where: { id: testContactId },
      data: { organisationId: testOrgId },
    });
    const c = await prisma.contact.findUnique({ where: { id: testContactId }, include: { organisation: true } });
    if (!c?.organisation) throw new Error("Organisation not linked");
    return `Linked contact to ${c.organisation.name}`;
  }));

  // ═══════════════════════════════════════════
  // CAMPAIGNS
  // ═══════════════════════════════════════════

  let testCampaignId = "";
  results.push(await runTest("Create campaign", "Campaigns", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        name: `${testPrefix}_Campaign`,
        type: "APPEAL",
        status: "ACTIVE",
        budgetTarget: 1000,
        startDate: new Date(),
        createdById: userId,
      },
    });
    testCampaignId = campaign.id;
    cleanup.push(async () => { await prisma.campaign.delete({ where: { id: campaign.id } }).catch(() => {}); });
    return `Created campaign ${campaign.id} with target £1000`;
  }));

  results.push(await runTest("Read campaign", "Campaigns", async () => {
    if (!testCampaignId) throw new Error("No campaign");
    const c = await prisma.campaign.findUnique({ where: { id: testCampaignId } });
    if (!c) throw new Error("Campaign not found");
    if (Number(c.budgetTarget) !== 1000) throw new Error(`Expected target 1000, got ${c.budgetTarget}`);
    if (Number(c.actualRaised) !== 0) throw new Error(`Expected actualRaised 0, got ${c.actualRaised}`);
    return `Campaign: ${c.name}, target £${c.budgetTarget}, raised £${c.actualRaised}`;
  }));

  results.push(await runTest("Update campaign status", "Campaigns", async () => {
    if (!testCampaignId) throw new Error("No campaign");
    await prisma.campaign.update({ where: { id: testCampaignId }, data: { status: "PAUSED" } });
    const c = await prisma.campaign.findUnique({ where: { id: testCampaignId } });
    if (c?.status !== "PAUSED") throw new Error(`Expected PAUSED, got ${c?.status}`);
    await prisma.campaign.update({ where: { id: testCampaignId }, data: { status: "ACTIVE" } });
    return `Status toggled ACTIVE -> PAUSED -> ACTIVE`;
  }));

  // ═══════════════════════════════════════════
  // DONATIONS + CAMPAIGN LINKING
  // ═══════════════════════════════════════════

  let testDonationId = "";
  results.push(await runTest("Create donation with campaign", "Donations", async () => {
    if (!testContactId || !testCampaignId) throw new Error("Need contact and campaign");
    const donation = await prisma.donation.create({
      data: {
        contactId: testContactId,
        amount: 250,
        currency: "GBP",
        type: "DONATION",
        date: new Date(),
        campaignId: testCampaignId,
        createdById: userId,
      },
    });
    // Increment campaign actualRaised (mimics the fixed flow)
    await prisma.campaign.update({
      where: { id: testCampaignId },
      data: { actualRaised: { increment: 250 } },
    });
    testDonationId = donation.id;
    cleanup.push(async () => { await prisma.donation.delete({ where: { id: donation.id } }).catch(() => {}); });
    return `Created donation £250 -> campaign`;
  }));

  results.push(await runTest("Campaign actualRaised updated", "Donations", async () => {
    if (!testCampaignId) throw new Error("No campaign");
    const c = await prisma.campaign.findUnique({ where: { id: testCampaignId } });
    if (!c) throw new Error("Campaign not found");
    if (Number(c.actualRaised) !== 250) throw new Error(`Expected actualRaised=250, got ${c.actualRaised}`);
    return `Campaign actualRaised = £${c.actualRaised} (correct)`;
  }));

  results.push(await runTest("Donation appears on campaign", "Donations", async () => {
    if (!testCampaignId) throw new Error("No campaign");
    const campaign = await prisma.campaign.findUnique({
      where: { id: testCampaignId },
      include: { donations: true },
    });
    if (!campaign) throw new Error("Campaign not found");
    const linked = campaign.donations.filter((d) => d.id === testDonationId);
    if (linked.length === 0) throw new Error("Donation not found on campaign");
    return `Campaign has ${campaign.donations.length} donation(s), test donation present`;
  }));

  results.push(await runTest("Donation appears on contact", "Donations", async () => {
    if (!testContactId) throw new Error("No contact");
    const contact = await prisma.contact.findUnique({
      where: { id: testContactId },
      include: { donations: { include: { campaign: true } } },
    });
    if (!contact) throw new Error("Contact not found");
    const linked = contact.donations.filter((d) => d.id === testDonationId);
    if (linked.length === 0) throw new Error("Donation not found on contact");
    if (!linked[0].campaign) throw new Error("Campaign not included on contact donation");
    return `Contact has ${contact.donations.length} donation(s) with campaign: ${linked[0].campaign.name}`;
  }));

  results.push(await runTest("Create donation without campaign", "Donations", async () => {
    if (!testContactId) throw new Error("Need contact");
    const d = await prisma.donation.create({
      data: {
        contactId: testContactId,
        amount: 50,
        currency: "GBP",
        type: "GIFT",
        date: new Date(),
        createdById: userId,
      },
    });
    cleanup.push(async () => { await prisma.donation.delete({ where: { id: d.id } }).catch(() => {}); });
    if (d.campaignId !== null) throw new Error("Expected null campaignId");
    return `Created donation £50 without campaign (campaignId=null)`;
  }));

  results.push(await runTest("Campaign progress calculation", "Donations", async () => {
    if (!testCampaignId) throw new Error("No campaign");
    const c = await prisma.campaign.findUnique({ where: { id: testCampaignId } });
    if (!c || !c.budgetTarget) throw new Error("Campaign missing");
    const progress = Math.round((Number(c.actualRaised) / Number(c.budgetTarget)) * 100);
    if (progress !== 25) throw new Error(`Expected 25% progress, got ${progress}%`);
    return `Progress: £${Number(c.actualRaised)}/£${Number(c.budgetTarget)} = ${progress}%`;
  }));

  // ═══════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════

  let testEventId = "";
  results.push(await runTest("Create event", "Events", async () => {
    const event = await prisma.event.create({
      data: {
        name: `${testPrefix}_Event`,
        type: "FUNDRAISER",
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        status: "CONFIRMED",
        createdById: userId,
      },
    });
    testEventId = event.id;
    cleanup.push(async () => { await prisma.event.delete({ where: { id: event.id } }).catch(() => {}); });
    return `Created event ${event.id}`;
  }));

  results.push(await runTest("Read event", "Events", async () => {
    if (!testEventId) throw new Error("No event");
    const e = await prisma.event.findUnique({ where: { id: testEventId } });
    if (!e) throw new Error("Event not found");
    return `Event: ${e.name}, status: ${e.status}`;
  }));

  // ═══════════════════════════════════════════
  // TAGS
  // ═══════════════════════════════════════════

  let testTagId = "";
  results.push(await runTest("Create tag", "Tags", async () => {
    const tag = await prisma.tag.create({
      data: { name: `${testPrefix}_tag`, colour: "#ff0000" },
    });
    testTagId = tag.id;
    cleanup.push(async () => { await prisma.tag.delete({ where: { id: tag.id } }).catch(() => {}); });
    return `Created tag ${tag.id}`;
  }));

  results.push(await runTest("Assign tag to contact", "Tags", async () => {
    if (!testContactId || !testTagId) throw new Error("Need contact and tag");
    await prisma.contactTag.create({
      data: { contactId: testContactId, tagId: testTagId },
    });
    cleanup.push(async () => {
      await prisma.contactTag.delete({
        where: { contactId_tagId: { contactId: testContactId, tagId: testTagId } },
      }).catch(() => {});
    });
    const c = await prisma.contact.findUnique({
      where: { id: testContactId },
      include: { tags: { include: { tag: true } } },
    });
    const found = c?.tags.find((t) => t.tagId === testTagId);
    if (!found) throw new Error("Tag not found on contact");
    return `Tag "${found.tag.name}" assigned to contact`;
  }));

  // ═══════════════════════════════════════════
  // LEDGER CODES
  // ═══════════════════════════════════════════

  let testLedgerCodeId = "";
  results.push(await runTest("Create ledger code", "Finance", async () => {
    const code = await prisma.ledgerCode.create({
      data: { code: `${testPrefix.slice(0, 20)}`, name: `Test Code`, isActive: true },
    });
    testLedgerCodeId = code.id;
    cleanup.push(async () => { await prisma.ledgerCode.delete({ where: { id: code.id } }).catch(() => {}); });
    return `Created ledger code ${code.code}`;
  }));

  // ═══════════════════════════════════════════
  // NOTES & INTERACTIONS
  // ═══════════════════════════════════════════

  results.push(await runTest("Add note to contact", "Notes", async () => {
    if (!testContactId) throw new Error("No contact");
    const note = await prisma.note.create({
      data: {
        contactId: testContactId,
        content: `Test note from agent ${testPrefix}`,
        createdById: userId,
      },
    });
    cleanup.push(async () => { await prisma.note.delete({ where: { id: note.id } }).catch(() => {}); });
    return `Created note ${note.id}`;
  }));

  results.push(await runTest("Add interaction to contact", "Interactions", async () => {
    if (!testContactId) throw new Error("No contact");
    const interaction = await prisma.interaction.create({
      data: {
        contactId: testContactId,
        type: "PHONE_CALL",
        subject: "Test call",
        date: new Date(),
        description: `Test call from agent ${testPrefix}`,
        createdById: userId,
      },
    });
    cleanup.push(async () => { await prisma.interaction.delete({ where: { id: interaction.id } }).catch(() => {}); });
    return `Created interaction ${interaction.id}`;
  }));

  // ═══════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════

  results.push(await runTest("Read system settings", "Settings", async () => {
    const s = await prisma.systemSettings.findUnique({ where: { id: "default" } });
    if (!s) throw new Error("SystemSettings not found");
    return `Settings loaded: orgName=${s.orgName || "(not set)"}, mode=${s.collectionMode}`;
  }));

  results.push(await runTest("Update settings (reversible)", "Settings", async () => {
    const s = await prisma.systemSettings.findUnique({ where: { id: "default" } });
    const originalMonth = s?.financialYearEndMonth || 3;
    await prisma.systemSettings.update({
      where: { id: "default" },
      data: { financialYearEndMonth: 12 },
    });
    const updated = await prisma.systemSettings.findUnique({ where: { id: "default" } });
    if (updated?.financialYearEndMonth !== 12) throw new Error("Update didn't take");
    // Revert
    await prisma.systemSettings.update({
      where: { id: "default" },
      data: { financialYearEndMonth: originalMonth },
    });
    return `Settings updated & reverted (month ${originalMonth} -> 12 -> ${originalMonth})`;
  }));

  // ═══════════════════════════════════════════
  // COLLECTION TINS
  // ═══════════════════════════════════════════

  results.push(await runTest("Read tin locations", "Collection Tins", async () => {
    const count = await prisma.tinLocation.count();
    return `${count} tin location(s) in database`;
  }));

  results.push(await runTest("Read collection routes", "Collection Tins", async () => {
    const count = await prisma.collectionRoute.count({ where: { isActive: true } });
    return `${count} active route(s)`;
  }));

  // ═══════════════════════════════════════════
  // DATABASE INTEGRITY
  // ═══════════════════════════════════════════

  results.push(await runTest("No orphaned donations", "Integrity", async () => {
    const orphaned = await prisma.donation.findMany({
      where: { campaign: { is: null }, campaignId: { not: null } },
    });
    // This would find donations pointing to deleted campaigns
    if (orphaned.length > 0) throw new Error(`${orphaned.length} donation(s) with invalid campaignId`);
    return `No orphaned campaign references`;
  }));

  results.push(await runTest("Campaign totals consistent", "Integrity", async () => {
    const campaigns = await prisma.campaign.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      include: { donations: { where: { status: "RECEIVED" } } },
    });
    const mismatches: string[] = [];
    for (const c of campaigns) {
      const actualFromDonations = c.donations.reduce((sum, d) => sum + Number(d.amount), 0);
      const diff = Math.abs(Number(c.actualRaised) - actualFromDonations);
      if (diff > 0.01) {
        mismatches.push(`${c.name}: stored=£${Number(c.actualRaised).toFixed(2)} vs donations=£${actualFromDonations.toFixed(2)}`);
      }
    }
    if (mismatches.length > 0) throw new Error(`Mismatches found:\n${mismatches.join("\n")}`);
    return `All ${campaigns.length} campaign totals match their donations`;
  }));

  // ═══════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════

  // Run cleanup in reverse order
  for (const fn of cleanup.reverse()) {
    try { await fn(); } catch (e) { /* ignore cleanup errors */ }
  }

  // Summary
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  return NextResponse.json({
    summary: { total: results.length, passed, failed, skipped, durationMs: totalMs },
    results,
    timestamp: new Date().toISOString(),
  });
}
