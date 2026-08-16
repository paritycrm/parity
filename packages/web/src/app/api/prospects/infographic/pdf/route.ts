import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

// Lighten a color
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

const categoryNames: Record<string, string> = {
  PUB: "Pubs", RESTAURANT: "Restaurants & Cafes", SHOP: "Shops & Retail",
  SCHOOL: "Schools", CHURCH: "Churches", OFFICE: "Offices", OTHER: "Other Locations",
};

const categoryIcons: Record<string, string> = {
  PUB: "🍺", RESTAURANT: "🍽️", SHOP: "🛍️",
  SCHOOL: "🎓", CHURCH: "⛪", OFFICE: "🏢", OTHER: "📍",
};

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  if (!category) {
    return NextResponse.json({ error: "category param required" }, { status: 400 });
  }

  // Get settings
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { orgName: true, primaryColour: true, charityDescription: true },
  });

  // Get stats
  const locations = await prisma.tinLocation.findMany({
    where: { isActive: true, type: category },
    include: {
      tins: {
        where: { status: "DEPLOYED" },
        include: {
          movements: { where: { type: "COUNTED" }, select: { amount: true } },
        },
      },
    },
  });

  let totalCollections = 0;
  let collectionCount = 0;
  for (const loc of locations) {
    for (const tin of loc.tins) {
      for (const mov of tin.movements) {
        if (mov.amount) { totalCollections += Number(mov.amount); collectionCount++; }
      }
    }
  }

  const totalTins = locations.reduce((s, l) => s + l.tins.length, 0);
  const avgCollection = collectionCount > 0 ? totalCollections / collectionCount : 0;
  const orgName = settings?.orgName || "Our Charity";
  const colour = settings?.primaryColour || "#4f46e5";
  const description = settings?.charityDescription || "";
  const catName = categoryNames[category] || category;
  const icon = categoryIcons[category] || "📍";

  // Generate PDF using PDFKit-like approach with raw PDF writing
  // Since we can't easily install pdfkit in the deploy, we'll generate
  // a simple but professional-looking HTML and convert it to a downloadable format
  // Actually, let's return the data and generate client-side.
  // Better approach: generate SVG-based PDF using a minimal PDF builder.

  // Simple PDF generation using raw PDF spec
  const pdf = buildInfographicPDF({
    orgName,
    colour,
    description,
    catName,
    icon,
    totalLocations: locations.length,
    totalTins,
    avgCollection,
    totalRaised: totalCollections,
    collectionCount,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${catName.replace(/\s+/g, "-")}-infographic.pdf"`,
    },
  });
}

// Minimal PDF builder — creates a clean, professional one-page infographic
function buildInfographicPDF(data: {
  orgName: string;
  colour: string;
  description: string;
  catName: string;
  icon: string;
  totalLocations: number;
  totalTins: number;
  avgCollection: number;
  totalRaised: number;
  collectionCount: number;
}): Buffer {
  // We'll use a simple approach: generate an HTML infographic and rely on
  // the client to print-to-PDF. For the API, return the raw data as JSON
  // and let the client render it. This is more reliable than raw PDF generation.
  // UPDATE: Let's generate actual PDF content using minimal PDF primitives.

  const { orgName, colour, description, catName, totalLocations, totalTins, avgCollection, totalRaised, collectionCount } = data;
  const [r, g, b] = hexToRgb(colour);
  const rf = r / 255, gf = g / 255, bf = b / 255;

  // A4 dimensions in points (595.28 x 841.89)
  const W = 595.28;
  const H = 841.89;

  let streams: string[] = [];

  // Background - white
  streams.push(`1 1 1 rg 0 0 ${W} ${H} re f`);

  // Header bar
  streams.push(`${rf} ${gf} ${bf} rg 0 ${H - 120} ${W} 120 re f`);

  // Title text - white
  streams.push(`BT /F1 28 Tf 1 1 1 rg 40 ${H - 70} Td (${escPdf(orgName)}) Tj ET`);
  streams.push(`BT /F2 14 Tf 1 1 1 rg 40 ${H - 95} Td (Collection Tin Partnership - ${escPdf(catName)}) Tj ET`);

  // Subtitle section
  const descY = H - 180;
  if (description) {
    // Wrap description text
    const lines = wrapText(description, 70);
    streams.push(`BT /F2 11 Tf 0.3 0.3 0.3 rg 40 ${descY} Td`);
    for (let i = 0; i < Math.min(lines.length, 4); i++) {
      if (i > 0) streams.push(`0 -16 Td`);
      streams.push(`(${escPdf(lines[i])}) Tj`);
    }
    streams.push(`ET`);
  }

  // Stats section
  const statsY = description ? descY - (Math.min(wrapText(description, 70).length, 4) * 16) - 40 : descY;
  streams.push(`BT /F1 18 Tf ${rf} ${gf} ${bf} rg 40 ${statsY} Td (How ${escPdf(catName)} Help Us) Tj ET`);

  // Stat boxes - 3 columns
  const boxY = statsY - 50;
  const boxW = 160;
  const boxH = 90;
  const gap = 17.64; // (W - 40*2 - 3*boxW) / 2

  const stats = [
    { value: totalLocations.toString(), label: `${catName} with our tins` },
    { value: totalTins.toString(), label: "Collection tins deployed" },
    { value: collectionCount > 0 ? `£${avgCollection.toFixed(2)}` : "N/A", label: "Avg collection per tin" },
  ];

  for (let i = 0; i < 3; i++) {
    const bx = 40 + i * (boxW + gap);

    // Box background - light version of primary colour
    const lr = Math.min(1, rf + (1 - rf) * 0.85);
    const lg = Math.min(1, gf + (1 - gf) * 0.85);
    const lb = Math.min(1, bf + (1 - bf) * 0.85);
    streams.push(`${lr} ${lg} ${lb} rg ${bx} ${boxY} ${boxW} ${boxH} re f`);

    // Rounded border in primary colour
    streams.push(`${rf} ${gf} ${bf} RG 1 w ${bx} ${boxY} ${boxW} ${boxH} re S`);

    // Value
    streams.push(`BT /F1 24 Tf ${rf} ${gf} ${bf} rg ${bx + 15} ${boxY + 50} Td (${escPdf(stats[i].value)}) Tj ET`);

    // Label
    const labelLines = wrapText(stats[i].label, 22);
    streams.push(`BT /F2 9 Tf 0.4 0.4 0.4 rg ${bx + 15} ${boxY + 28} Td`);
    for (let j = 0; j < labelLines.length; j++) {
      if (j > 0) streams.push(`0 -12 Td`);
      streams.push(`(${escPdf(labelLines[j])}) Tj`);
    }
    streams.push(`ET`);
  }

  // Total raised section
  const raisedY = boxY - 70;
  if (totalRaised > 0) {
    streams.push(`${rf} ${gf} ${bf} rg 40 ${raisedY} ${W - 80} 50 re f`);
    streams.push(`BT /F1 20 Tf 1 1 1 rg 60 ${raisedY + 17} Td (Total raised from ${escPdf(catName.toLowerCase())}: \\243${totalRaised.toFixed(2)}) Tj ET`);
  }

  // "Why partner with us" section
  const whyY = totalRaised > 0 ? raisedY - 50 : raisedY;
  streams.push(`BT /F1 18 Tf ${rf} ${gf} ${bf} rg 40 ${whyY} Td (Why Partner With ${escPdf(orgName)}?) Tj ET`);

  const benefits = [
    "A simple, no-effort way to support your local community",
    "We provide the collection tin and collect it regularly",
    "Your customers can donate loose change while they visit",
    "We share collection reports so you can see your impact",
    "Helps build community goodwill for your business",
  ];

  let by = whyY - 30;
  for (const b of benefits) {
    streams.push(`BT /F2 11 Tf 0.2 0.2 0.2 rg 55 ${by} Td (\\267  ${escPdf(b)}) Tj ET`);
    by -= 20;
  }

  // Contact / CTA section
  const ctaY = by - 30;
  streams.push(`${rf} ${gf} ${bf} rg 40 ${ctaY} ${W - 80} 60 re f`);
  streams.push(`BT /F1 16 Tf 1 1 1 rg 60 ${ctaY + 30} Td (Get in touch to host a collection tin!) Tj ET`);
  streams.push(`BT /F2 11 Tf 1 1 1 rg 60 ${ctaY + 10} Td (Contact us to find out more about how we can work together.) Tj ET`);

  // Footer
  streams.push(`BT /F2 8 Tf 0.6 0.6 0.6 rg 40 30 Td (Generated by ${escPdf(orgName)} via Parity CRM) Tj ET`);

  // Build PDF document
  const stream = streams.join("\n");

  const objects: string[] = [];
  let objCount = 0;

  function addObj(content: string): number {
    objCount++;
    objects.push(`${objCount} 0 obj\n${content}\nendobj`);
    return objCount;
  }

  // 1. Catalog
  addObj(`<< /Type /Catalog /Pages 2 0 R >>`);

  // 2. Pages
  addObj(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);

  // 3. Page
  addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`);

  // 4. Content stream
  const streamBytes = Buffer.from(stream, "latin1");
  addObj(`<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`);

  // 5. Font - Helvetica Bold
  addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

  // 6. Font - Helvetica
  addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);

  // Build xref
  const header = "%PDF-1.4\n";
  let body = objects.join("\n") + "\n";
  const xrefOffset = header.length + body.length;

  const xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n` +
    objects.map((_, i) => {
      const offset = header.length + objects.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      return offset.toString().padStart(10, "0") + " 00000 n ";
    }).join("\n") + "\n";

  const trailer = `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}

function escPdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number): string[] {
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
  return lines;
}
