import { describe, expect, it } from "vitest";
import { buildFinancialSummaryEmail, hasEmailConfiguration } from "./summaryEmail";
import { summaryCron } from "./summaryScheduler";

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

  it("uses distinct weekly and monthly cadence expressions", () => {
    expect(summaryCron("weekly", 3)).toBe("0 0 13 * * 3");
    expect(summaryCron("monthly", 1, 15)).toBe("0 0 13 15 * *");
  });
});
