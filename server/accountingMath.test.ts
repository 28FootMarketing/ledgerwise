import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals, calculateProfitAndLoss, effectiveInvoiceStatus, summarizeFinancials, validateBalancedJournalLines } from "./accountingMath";

describe("accounting rules", () => {
  it("calculates invoice totals from entered line items", () => {
    const totals = calculateInvoiceTotals([
      { description: "Consulting", quantity: 2, unitAmountCents: 12500 },
      { description: "Travel", quantity: 1, unitAmountCents: 3500 },
    ], 2850);

    expect(totals).toMatchObject({ subtotalCents: 28500, taxCents: 2850, totalCents: 31350 });
  });

  it("rejects an unbalanced double-entry journal", () => {
    expect(() => validateBalancedJournalLines([
      { accountId: 1, debitCents: 2000, creditCents: 0 },
      { accountId: 2, debitCents: 0, creditCents: 1500 },
    ])).toThrow("must balance");
  });

  it("marks an unpaid sent invoice overdue after its due date", () => {
    expect(effectiveInvoiceStatus("sent", new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z"))).toBe("overdue");
  });

  it("summarizes revenue, expenses, profit, and outstanding invoices from stored records", () => {
    const summary = summarizeFinancials([
      { status: "paid", dueAt: new Date("2026-02-01T00:00:00Z"), totalCents: 20000 },
      { status: "sent", dueAt: new Date("2026-12-01T00:00:00Z"), totalCents: 5000 },
      { status: "draft", dueAt: new Date("2026-12-01T00:00:00Z"), totalCents: 7000 },
    ], [{ amountCents: 9000 }], new Date("2026-06-01T00:00:00Z"));

    expect(summary).toEqual({ revenueCents: 25000, expensesCents: 9000, netProfitCents: 16000, outstandingCents: 5000, invoiceCount: 3 });
  });
});

describe("Profit & Loss statement", () => {
  it("separates cost of goods sold from operating expenses and derives profit totals", () => {
    const statement = calculateProfitAndLoss(500000, [
      { accountId: 1, accountCode: "5100", accountName: "Cost of goods sold", amountCents: 120000 },
      { accountId: 2, accountCode: "6100", accountName: "Software", amountCents: 30000 },
    ]);

    expect(statement).toMatchObject({ revenueCents: 500000, costOfGoodsSoldCents: 120000, grossProfitCents: 380000, operatingExpenseCents: 30000, operatingProfitCents: 350000, netProfitCents: 350000 });
    expect(statement.costOfGoodsSold).toHaveLength(1);
    expect(statement.operatingExpenses).toHaveLength(1);
  });
});
