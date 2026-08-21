import { describe, expect, it } from "vitest";
import { assertTagOwnership, attachPersistedTags, buildTagSummary, filterTransactionsByDate, filterTransactionsByTag, normalizeTagIds } from "./tagRules";
import { summarizeFinancials } from "./accountingMath";
import { calculateProfitAndLoss } from "./accountingMath";

describe("custom tag rules", () => {
  it("deduplicates valid tag assignments before a transaction is saved", () => {
    expect(normalizeTagIds([4, 8, 4, 13])).toEqual([4, 8, 13]);
  });

  it("rejects invalid or excessive tag assignment sets", () => {
    expect(() => normalizeTagIds([0])).toThrow("valid identifiers");
    expect(() => normalizeTagIds(Array.from({ length: 13 }, (_, index) => index + 1))).toThrow("up to 12");
  });

  it("rejects tags outside the caller-owned tag set", () => {
    expect(assertTagOwnership([2, 4], [2, 4, 8])).toEqual([2, 4]);
    expect(() => assertTagOwnership([2, 9], [2, 4, 8])).toThrow("not in your workspace");
  });

  it("returns only transactions assigned to a selected tag", () => {
    const transactions = [{ id: 1, tags: [{ id: 2 }] }, { id: 2, tags: [{ id: 4 }, { id: 8 }] }, { id: 3, tags: [] }];
    expect(filterTransactionsByTag(transactions, 4).map(transaction => transaction.id)).toEqual([2]);
    expect(filterTransactionsByTag(transactions).map(transaction => transaction.id)).toEqual([1, 2, 3]);
  });

  it("attaches tags retrieved from persisted assignment rows to matching transactions", () => {
    const expenses = attachPersistedTags([{ id: 10, amountCents: 1800 }, { id: 11, amountCents: 2400 }], [{ expenseId: 10, id: 2, name: "Travel" }, { expenseId: 10, id: 4, name: "Client A" }], "expenseId");
    expect(expenses[0].tags).toEqual([{ id: 2, name: "Travel" }, { id: 4, name: "Client A" }]);
    expect(expenses[1].tags).toEqual([]);
  });

  it("calculates selected-tag expense and manual-entry totals from tagged records", () => {
    const tagRows = [{ id: 2, name: "Travel" }, { id: 4, name: "Client A" }];
    const expenses = [{ amountCents: 1800, tags: [{ id: 2 }] }, { amountCents: 2400, tags: [{ id: 4 }] }];
    const entries = [{ sourceType: "manual", tags: [{ id: 2 }] }, { sourceType: "invoice", tags: [{ id: 2 }] }];
    expect(buildTagSummary(tagRows, expenses, entries, 2)).toEqual([{ id: 2, name: "Travel", expenseCents: 1800, manualEntryCount: 1 }]);
  });

  it("changes financial expenses and profit totals when a selected tag filters the expense records", () => {
    const invoices = [{ status: "paid" as const, dueAt: new Date("2026-08-01"), totalCents: 10000 }];
    const expenses = [{ amountCents: 1800, tags: [{ id: 2 }] }, { amountCents: 4200, tags: [{ id: 4 }] }];
    const allTotals = summarizeFinancials(invoices, expenses, new Date("2026-08-20"));
    const tagTotals = summarizeFinancials(invoices, filterTransactionsByTag(expenses, 2), new Date("2026-08-20"));
    expect(allTotals).toMatchObject({ expensesCents: 6000, netProfitCents: 4000 });
    expect(tagTotals).toMatchObject({ expensesCents: 1800, netProfitCents: 8200 });
  });

  it("changes Profit & Loss expense and net-profit totals when a selected tag filters category rows", () => {
    const taggedExpenses = [{ accountId: 9, accountCode: "6100", accountName: "Software", amountCents: 2500, tags: [{ id: 2 }] }, { accountId: 10, accountCode: "6200", accountName: "Travel", amountCents: 4500, tags: [{ id: 4 }] }];
    const statement = calculateProfitAndLoss(20000, filterTransactionsByTag(taggedExpenses, 2));
    expect(statement).toMatchObject({ operatingExpenseCents: 2500, netProfitCents: 17500 });
    expect(statement.operatingExpenses).toEqual([{ accountId: 9, code: "6100", name: "Software", amountCents: 2500 }]);
  });

  it("changes Profit & Loss rows and totals when date and custom-tag filters are combined", () => {
    const expenses = [
      { accountId: 9, accountCode: "6100", accountName: "Software", amountCents: 2500, incurredAt: new Date("2026-08-08T00:00:00Z"), tags: [{ id: 2 }] },
      { accountId: 9, accountCode: "6100", accountName: "Software", amountCents: 3000, incurredAt: new Date("2026-09-08T00:00:00Z"), tags: [{ id: 2 }] },
      { accountId: 10, accountCode: "6200", accountName: "Travel", amountCents: 4500, incurredAt: new Date("2026-08-12T00:00:00Z"), tags: [{ id: 4 }] },
    ];
    const augustTagTwo = filterTransactionsByTag(filterTransactionsByDate(expenses, new Date("2026-08-01T00:00:00Z"), new Date("2026-08-31T23:59:59Z"), "incurredAt"), 2);
    const statement = calculateProfitAndLoss(20000, augustTagTwo);
    expect(statement).toMatchObject({ operatingExpenseCents: 2500, netProfitCents: 17500 });
    expect(statement.operatingExpenses).toEqual([{ accountId: 9, code: "6100", name: "Software", amountCents: 2500 }]);
  });
});
