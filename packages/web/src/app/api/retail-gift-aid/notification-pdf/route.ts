import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildRetailGiftAidLetterText } from "@/lib/retail-gift-aid-letter";
import { formatCurrency , formatDate } from '@/lib/utils';

// A4 dimensions in points
const W = 595.28;
const H = 841.89;
const MARGIN = 60;
const LINE_HEIGHT = 16;
const FONT_SIZE = 11;
const HEADING_SIZE = 13;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * Generate PDF letters for all contacts in a retail gift aid claim who don't have email.
 * GET /api/retail-gift-aid/notification-pdf?claimId=xxx
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const claimId = url.searchParams.get("claimId");
  if (!claimId) {
    return NextResponse.json({ error: "claimId required" }, { status: 400 });
  }

  const claim = await prisma.giftAidClaim.findUnique({
    where: { id: claimId },
    include: {
      notifications: {
        where: { method: "POST" },
        include: {
          contact: {
            select: {
              firstName: true,
              lastName: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              postcode: true,
            },
          },
        },
      },
    },
  });

  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: {
      orgName: true,
      primaryColour: true,
      letterheadImage: true,
      headOfficeAddress: true,
    },
  });

  const charityName = settings?.orgName || "Our Charity";
  const charityNumber = "";
  const charityAddress = settings?.headOfficeAddress || "";

  const colour = settings?.primaryColour || "#7c3aed";
  const [rf, gf, bf] = hexToRgb(colour);
  const brandColour = rgb(rf, gf, bf);

  const postNotifications = claim.notifications;

  if (postNotifications.length === 0) {
    return NextResponse.json(
      { error: "No postal notifications to generate" },
      { status: 400 }
    );
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const taxYearStart = formatDate(claim.periodStart);
  const taxYearEnd = formatDate(claim.periodEnd);

  const deadline = claim.notificationDeadline
    ? formatDate(claim.notificationDeadline)
    : "28 days from receipt";

  for (const notif of postNotifications) {
    const contactAddress = [
      notif.contact.addressLine1,
      notif.contact.addressLine2,
      notif.contact.city,
      notif.contact.postcode,
    ]
      .filter(Boolean)
      .join(", ");

    // Get their specific items from the claim
    const items = await prisma.giftAidClaimItem.findMany({
      where: {
        claimId: claim.id,
        contactId: notif.contactId,
        status: "INCLUDED",
      },
    });

    const totalProceeds = items.reduce((s, i) => s + Number(i.donationAmount), 0);
    const giftAidAmount = items.reduce((s, i) => s + Number(i.giftAidAmount), 0);

    const letterText = buildRetailGiftAidLetterText({
      contactName: notif.contactName,
      contactAddress,
      charityName,
      charityAddress,
      charityNumber,
      charityPhone: "",
      claimReference: claim.claimReference,
      taxYearStart,
      taxYearEnd,
      totalProceeds: formatCurrency(totalProceeds),
      giftAidClaimed: formatCurrency(giftAidAmount),
      donationCount: items.length,
      optOutToken: notif.token,
      emailConsentToken: notif.token,
      notificationDeadline: deadline,
      hasEmail: false,
    });

    // Render text onto PDF pages
    const lines = letterText.split("\n");
    let page = pdfDoc.addPage([W, H]);
    let y = H - MARGIN;

    // Header bar
    page.drawRectangle({
      x: 0,
      y: H - 40,
      width: W,
      height: 40,
      color: brandColour,
    });
    page.drawText(charityName, {
      x: MARGIN,
      y: H - 28,
      size: 14,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    y = H - 70;

    for (const rawLine of lines) {
      const isHeading =
        rawLine === rawLine.toUpperCase() &&
        rawLine.trim().length > 3 &&
        !rawLine.startsWith("Visit:") &&
        !rawLine.startsWith("Total") &&
        !rawLine.startsWith("Gift Aid") &&
        !rawLine.startsWith("Number") &&
        !rawLine.startsWith("Registered");

      const currentFont = isHeading ? fontBold : font;
      const currentSize = isHeading ? HEADING_SIZE : FONT_SIZE;
      const maxChars = Math.floor((W - MARGIN * 2) / (currentSize * 0.55));

      if (rawLine.trim() === "") {
        y -= LINE_HEIGHT * 0.7;
      } else {
        const wrapped = wrapLine(rawLine, maxChars);
        for (const wl of wrapped) {
          if (y < MARGIN + 30) {
            page = pdfDoc.addPage([W, H]);
            y = H - MARGIN;
          }
          page.drawText(wl, {
            x: MARGIN,
            y,
            size: currentSize,
            font: currentFont,
            color: rgb(0.1, 0.1, 0.1),
          });
          y -= LINE_HEIGHT;
        }
      }
    }
  }

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="retail-gift-aid-letters-${claim.claimReference}.pdf"`,
    },
  });
}
