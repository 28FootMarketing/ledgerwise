import { describe, expect, it } from "vitest";
import { calculateProfitAndLossFromRecords } from "./db";

const accounts = [{ id: 9, code: "6100", name: "Software" }, { id: 10, code: "6200", name: "Travel" }];
const expenses = [
  { expenseAccountId: 9, amountCents: 2500, incurredAt: new Date("2026-08-08T00:00:00Z"), tags: [{ id: 2 }] },
  { expenseAccountId: 10, amountCents: 4500, incurredAt: new Date("2026-08-12T00:00:00Z"), tags: [{ id: 4 }] },
  { expenseAccountId: 9, amountCents: 3000, incurredAt: new Date("2026-09-08T00:00:00Z"), tags: [{ id: 2 }] },
];

describe("Profit & Loss service filtering", () => {
  it("changes returned statement totals when only the date range changes", () => {
    const august = calculateProfitAndLossFromRecords({ revenueCents: 20000 }, expenses, accounts, { start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-08-31T23:59:59Z") });
    const september = calculateProfitAndLossFromRecords({ revenueCents: 20000 }, expenses, accounts, { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-09-30T23:59:59Z") });
    expect(august).toMatchObject({ operatingExpenseCents: 7000, netProfitCents: 13000 });
    expect(september).toMatchObject({ operatingExpenseCents: 3000, netProfitCents: 17000 });
  });

  it("returns only the selected tag's in-range statement rows and totals", () => {
    const result = calculateProfitAndLossFromRecords({ revenueCents: 20000 }, expenses, accounts, { start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-08-31T23:59:59Z"), tagId: 2 });
    expect(result).toMatchObject({ operatingExpenseCents: 2500, netProfitCents: 17500 });
    expect(result.operatingExpenses).toEqual([{ accountId: 9, code: "6100", name: "Software", amountCents: 2500 }]);
  });
});
