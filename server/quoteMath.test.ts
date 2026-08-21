import { describe, expect, it } from "vitest";
import { calculateQuoteTotals } from "./quoteMath";

describe("quote totals", () => {
  it("separates one-time and monthly quote scope while retaining item line totals", () => {
    const result = calculateQuoteTotals([
      { serviceCatalogId: 1, description: "Implementation", category: "Build", quantity: 2, unitAmountCents: 12500, billingFrequency: "one_time" },
      { serviceCatalogId: 2, description: "Support", category: "Care", quantity: 1, unitAmountCents: 3400, billingFrequency: "monthly" },
    ]);
    expect(result).toMatchObject({ oneTimeCents: 25000, monthlyCents: 3400 });
    expect(result.items.map(item => item.lineTotalCents)).toEqual([25000, 3400]);
  });

  it("rejects incomplete quote lines before a quote can be persisted", () => {
    expect(() => calculateQuoteTotals([{ description: "", quantity: 1, unitAmountCents: 100, billingFrequency: "one_time" }])).toThrow("description");
  });
});
