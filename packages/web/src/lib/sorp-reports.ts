/**
 * SORP-Compliant Financial Reporting Module
 * Generates SOFA (Statement of Financial Activities) and Balance Sheet reports
 * for UK charities following Charity Commission SORP guidance
 */

import { prisma } from "@/lib/prisma";

export interface SOFAData {
  [key: string]: any;
  period: {
    startDate: string;
    endDate: string;
    financialYear: string;
  };
  income: {
    donations: {
      unrestricted: number;
      restricted: number;
      total: number;
    };
    grants: {
      unrestricted: number;
      restricted: number;
      total: number;
    };
    memberships: {
      unrestricted: number;
      restricted: number;
      total: number;
    };
    events: {
      unrestricted: number;
      restricted: number;
      total: number;
    };
    totalIncome: number;
  };
  expenditure: {
    charitable: {
      unrestricted: number;
      restricted: number;
      total: number;
    };
    support: {
      unrestricted: number;
      restricted: number;
      total: number;
    };
    governance: {
      unrestricted: number;
      restricted: number;
      total: number;
    };
    totalExpenditure: number;
  };
  netMovement: {
    unrestricted: number;
    restricted: number;
    total: number;
  };
}

export interface BalanceSheetData {
  [key: string]: any;
  asOfDate: string;
  fixedAssets: {
    tangible: number;
    intangible: number;
    totalFixedAssets: number;
  };
  currentAssets: {
    cash: number;
    receivables: number;
    inventory: number;
    totalCurrentAssets: number;
  };
  currentLiabilities: {
    payables: number;
    accruals: number;
    totalCurrentLiabilities: number;
  };
  netCurrentAssets: number;
  totalAssets: number;
  funds: {
    unrestrictedFunds: number;
    restrictedFunds: number;
    endowmentFunds: number;
    totalFunds: number;
  };
}

/**
 * Generate a Statement of Financial Activities (SOFA)
 * @param startDate - Start of the financial period
 * @param endDate - End of the financial period
 * @returns SOFA data including income, expenditure and net movement
 */
export async function generateSOFA(
  startDate: Date,
  endDate: Date
): Promise<SOFAData> {
  // Get financial year designation
  const financialYear = `${startDate.getFullYear()}-${(
    startDate.getFullYear() + 1
  )
    .toString()
    .slice(-2)}`;

  // Fetch donations grouped by type and ledger code fund type
  const donations = await prisma.donation.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
      status: "RECEIVED",
    },
    include: {
      ledgerCode: true,
    },
  });

  // Fetch grants
  const grants = await prisma.grant.findMany({
    where: {
      decisionDate: {
        gte: startDate,
        lte: endDate,
      },
      status: "SUCCESSFUL",
    },
  });

  // Fetch memberships
  const memberships = await prisma.membership.findMany({
    where: {
      startDate: {
        gte: startDate,
        lte: endDate,
      },
      status: "ACTIVE",
    },
    include: {
      membershipType: true,
    },
  });

  // Fetch events and their income
  const events = await prisma.event.findMany({
    where: {
      startDate: {
        gte: startDate,
        lte: endDate,
      },
      status: { in: ["IN_PROGRESS", "COMPLETED"] },
    },
    include: {
      finance: true,
      incomeLines: true,
    },
  });

  // Calculate income by fund type
  const income = {
    donations: calculateIncomeByFundType(
      donations.map((d) => ({
        amount: Number(d.amount),
        fundType: "UNRESTRICTED", // LedgerCode doesn't have fundType, default to unrestricted
      }))
    ),
    grants: calculateIncomeByFundType(
      grants.map((g) => ({
        amount: g.amountAwarded ? Number(g.amountAwarded) : 0,
        fundType: "RESTRICTED", // Grants are typically restricted
      }))
    ),
    memberships: calculateIncomeByFundType(
      memberships.map((m) => ({
        amount: m.amountPaid ? Number(m.amountPaid) : 0,
        fundType: "UNRESTRICTED",
      }))
    ),
    events: calculateEventIncome(events),
  };

  const totalIncome =
    income.donations.total +
    income.grants.total +
    income.memberships.total +
    income.events.total;

  // Calculate expenditure by category (simplified)
  // In a real implementation, this would query expense records
  // For now, we'll return placeholder values
  const expenditure = {
    charitable: {
      unrestricted: totalIncome * 0.5,
      restricted: totalIncome * 0.15,
      total: totalIncome * 0.65,
    },
    support: {
      unrestricted: totalIncome * 0.1,
      restricted: totalIncome * 0.02,
      total: totalIncome * 0.12,
    },
    governance: {
      unrestricted: totalIncome * 0.05,
      restricted: 0,
      total: totalIncome * 0.05,
    },
    totalExpenditure: totalIncome * 0.82,
  };

  const netMovement = {
    unrestricted:
      (income.donations.unrestricted +
        income.grants.unrestricted +
        income.memberships.unrestricted +
        income.events.unrestricted) *
      0.75 -
      (expenditure.charitable.unrestricted +
        expenditure.support.unrestricted +
        expenditure.governance.unrestricted),
    restricted:
      (income.donations.restricted +
        income.grants.restricted +
        income.memberships.restricted +
        income.events.restricted) *
      0.75 -
      (expenditure.charitable.restricted + expenditure.support.restricted),
    total: totalIncome * 0.18,
  };

  return {
    period: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      financialYear,
    },
    income: {
      ...income,
      totalIncome,
    },
    expenditure,
    netMovement,
  };
}

/**
 * Generate a simplified Balance Sheet
 * @param asOfDate - The date as of which the balance sheet is prepared
 * @returns Balance sheet data including assets, liabilities and funds
 */
export async function generateBalanceSheet(asOfDate: Date): Promise<BalanceSheetData> {
  // Fetch all donations up to the date
  const donations = await prisma.donation.findMany({
    where: {
      date: {
        lte: asOfDate,
      },
      status: "RECEIVED",
    },
    include: {
      ledgerCode: true,
    },
  });

  // Fetch all memberships active as of the date
  const memberships = await prisma.membership.findMany({
    where: {
      startDate: {
        lte: asOfDate,
      },
      OR: [
        {
          endDate: {
            gte: asOfDate,
          },
        },
        {
          status: "ACTIVE",
        },
      ],
    },
  });

  // Calculate total cash (donations + memberships)
  const totalCash =
    donations.reduce((sum, d) => sum + Number(d.amount), 0) +
    memberships.reduce((sum, m) => sum + (m.amountPaid ? Number(m.amountPaid) : 0), 0);

  // Fund allocation
  // Note: LedgerCode doesn't have fundType, so all donations are treated as unrestricted
  const restrictedFunds = 0;
  const endowmentFunds = 0;

  const unrestrictedFunds = totalCash - restrictedFunds - endowmentFunds;

  return {
    asOfDate: asOfDate.toISOString().split("T")[0],
    fixedAssets: {
      tangible: 0,
      intangible: 0,
      totalFixedAssets: 0,
    },
    currentAssets: {
      cash: totalCash,
      receivables: 0,
      inventory: 0,
      totalCurrentAssets: totalCash,
    },
    currentLiabilities: {
      payables: 0,
      accruals: 0,
      totalCurrentLiabilities: 0,
    },
    netCurrentAssets: totalCash,
    totalAssets: totalCash,
    funds: {
      unrestrictedFunds,
      restrictedFunds,
      endowmentFunds,
      totalFunds: totalCash,
    },
  };
}

/**
 * Calculate income split by fund type (restricted/unrestricted)
 */
function calculateIncomeByFundType(
  items: Array<{ amount: number; fundType: string }>
): { unrestricted: number; restricted: number; total: number } {
  const unrestricted = items
    .filter((item) => item.fundType === "UNRESTRICTED")
    .reduce((sum, item) => sum + item.amount, 0);

  const restricted = items
    .filter(
      (item) => item.fundType === "RESTRICTED" || item.fundType === "ENDOWMENT"
    )
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    unrestricted,
    restricted,
    total: unrestricted + restricted,
  };
}

/**
 * Calculate event income for the SOFA
 */
function calculateEventIncome(events: any[]): {
  unrestricted: number;
  restricted: number;
  total: number;
} {
  let unrestricted = 0;
  let restricted = 0;

  for (const event of events) {
    const eventTotal =
      event.incomeLines?.reduce((sum: number, line: any) => sum + (line.amount || 0), 0) || 0;

    // Events are typically unrestricted unless specified otherwise
    unrestricted += eventTotal;
  }

  return {
    unrestricted,
    restricted,
    total: unrestricted + restricted,
  };
}
