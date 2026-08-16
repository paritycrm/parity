import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";

function generateBACSFile(
  payments: Array<{
    id: string;
    amount: number;
    contactName: string;
    sortCode?: string;
    bankAccount?: string;
    reference?: string;
  }>
): string {
  const now = new Date();
  const fileDate = now.toISOString().split("T")[0].replace(/-/g, "");
  const fileTime = now.toTimeString().split(" ")[0].replace(/:/g, "");

  // BACS Header Record (type 0)
  const header =
    "0" + // Record type
    "900111" + // File sender's sort code (placeholder)
    " ".repeat(9) + // Blank
    fileDate + // File creation date (DDMMYY)
    fileTime.substring(0, 4) + // File creation time (HHMM)
    " ".repeat(5) + // Sequence number
    "1" + // Version
    " ".repeat(39); // Blank

  // Detail Records (type 1)
  const details: string[] = [];
  let totalAmount = 0;
  let paymentCount = 0;

  for (const payment of payments) {
    const sortCode = (payment.sortCode || "000000").replace(/\D/g, "");
    const accountNumber = (payment.bankAccount || "00000000").replace(/\D/g, "");
    const amount = Math.round(Number(payment.amount) * 100); // Convert to pence
    totalAmount += amount;
    paymentCount += 1;

    const detail =
      "1" + // Record type
      "01" + // User number
      sortCode.padEnd(6, " ") + // Sort code
      accountNumber.padEnd(8, " ") + // Account number
      payment.contactName.substring(0, 18).padEnd(18, " ") + // Name
      String(amount).padStart(10, "0") + // Amount in pence
      (payment.reference || "DONATION").substring(0, 8).padEnd(8, " ") + // Reference
      " ".repeat(9) + // Blank
      "000001"; // Sequence number

    details.push(detail);
  }

  // Trailer Record (type 9)
  const trailer =
    "9" + // Record type
    "999999" + // User sort code
    " ".repeat(9) + // Blank
    String(paymentCount).padStart(6, "0") + // Number of detail records
    String(totalAmount).padStart(14, "0") + // Total amount
    " ".repeat(35); // Blank

  return [header, ...details, trailer].join("\n");
}

export async function GET() {
  try {
    await requireAuth();

    // Fetch pending payments
    const payments = await prisma.payment.findMany({
      where: { status: "PENDING" },
      include: { contact: true },
      take: 1000,
    });

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        contactName: `${p.contact?.firstName || ""} ${p.contact?.lastName || ""}`.trim(),
        contactEmail: p.contact?.email || "",
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt,
      })),
      paymentRuns: [],
    });
  } catch (error) {
    console.error("BACS fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch BACS data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const { paymentIds } = await request.json();

    if (!paymentIds || paymentIds.length === 0) {
      return NextResponse.json(
        { error: "No payments selected" },
        { status: 400 }
      );
    }

    // Fetch selected payments
    const payments = await prisma.payment.findMany({
      where: { id: { in: paymentIds } },
      include: { contact: true },
    });

    if (payments.length === 0) {
      return NextResponse.json(
        { error: "No payments found" },
        { status: 404 }
      );
    }

    // Note: Payment run tracking would be stored in Payment metadata
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    // Update payment statuses
    await prisma.payment.updateMany({
      where: { id: { in: paymentIds } },
      data: { status: "SUBMITTED" },
    });

    // Generate BACS file
    const bacsData = generateBACSFile(
      payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        contactName: `${p.contact?.firstName || ""} ${p.contact?.lastName || ""}`.trim(),
        reference: p.description || undefined,
      }))
    );

    return new NextResponse(bacsData, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="BACS_${new Date().toISOString().split("T")[0]}.bacs"`,
      },
    });
  } catch (error) {
    console.error("BACS generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate BACS file" },
      { status: 500 }
    );
  }
}
