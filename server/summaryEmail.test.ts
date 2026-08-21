import { describe, expect, it } from "vitest";
import { buildFinancialSummaryEmail, hasEmailConfiguration } from "./summaryEmail";
import { isDueToday } from "./summaryScheduler";

describe("financial summary email configuration", () => {
  it("recognizes a complete dedicated email configuration without exposing its values", () => {
    expect(hasEmailConfiguration({ apiKey: "re_test", fromEmail: "Finance <finance@example.com>" })).toBe(true);
    expect(hasEmailConfiguration({ apiKey: "", fromEmail: "Finance <finance@example.com>" })).toBe(false);
  });

  it("builds a financial summary from actual calculated amounts", () => {
    const email = buildFinancialSummaryEmail({ recipientEmail: "owner@example.com", periodLabel: "Jan 1 – Jan 31", revenueCents: 150000, expensesCents: 50000, netProfitCents: 100000, outstandingCents: 25000 });
    expect(email.subject).toContain("LedgerWise financial summary");
    expect(email.html).toContain("$1,500.00");
    expect(email.html).toContain("$250.00");
  });

  it("matches weekly schedules on the configured UTC weekday and monthly on the configured day", () => {
    // 2026-01-07 is a Wednesday (getUTCDay() === 3).
    const wednesday = new Date(Date.UTC(2026, 0, 7, 13, 0, 0));
    expect(isDueToday({ cadence: "weekly", dayOfWeek: 3, dayOfMonth: 1 }, wednesday)).toBe(true);
    expect(isDueToday({ cadence: "weekly", dayOfWeek: 1, dayOfMonth: 1 }, wednesday)).toBe(false);

    const fifteenth = new Date(Date.UTC(2026, 0, 15, 13, 0, 0));
    expect(isDueToday({ cadence: "monthly", dayOfWeek: 1, dayOfMonth: 15 }, fifteenth)).toBe(true);
    expect(isDueToday({ cadence: "monthly", dayOfWeek: 1, dayOfMonth: 1 }, fifteenth)).toBe(false);
  });
});
