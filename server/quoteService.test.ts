import { describe, expect, it } from "vitest";
import { assembleQuoteRecords, assertQuoteWorkspace, buildInvoiceFromQuote } from "./quoteService";

describe("quote persistence services", () => {
  it("reassembles persisted quote-line records under their correct quote", () => {
    const records = assembleQuoteRecords([{ id: 1, customerId: 9, number: "Q-1" }, { id: 2, customerId: 10, number: "Q-2" }], [{ quoteId: 1, description: "Build", quantity: 1, unitAmountCents: 1000, billingFrequency: "one_time" }, { quoteId: 2, description: "Care", quantity: 1, unitAmountCents: 200, billingFrequency: "monthly" }], [{ id: 9, name: "A" }, { id: 10, name: "B" }]);
    expect(records[0]).toMatchObject({ customer: { id: 9, name: "A" }, items: [{ description: "Build" }] });
    expect(records[1]).toMatchObject({ customer: { id: 10, name: "B" }, items: [{ description: "Care" }] });
  });

  it("builds a draft invoice from stored quote lines and preserves converted quote idempotence", () => {
    const base = { id: 4, customerId: 8, issueAt: new Date("2026-08-20T12:00:00Z"), notes: "Approved scope", monthlyCents: 3000, convertedInvoiceId: null };
    const items = [{ quoteId: 4, description: "Build", quantity: 2, unitAmountCents: 12000, billingFrequency: "one_time" as const }, { quoteId: 4, description: "Care", quantity: 1, unitAmountCents: 3000, billingFrequency: "monthly" as const }];
    const conversion = buildInvoiceFromQuote(base, items, "INV-4", new Date("2026-09-20T12:00:00Z"));
    expect(conversion).toMatchObject({ alreadyConverted: false, input: { customerId: 8, number: "INV-4", items: [{ description: "Build", quantity: 2 }, { description: "Care (monthly)", quantity: 1 }] } });
    expect(buildInvoiceFromQuote({ ...base, convertedInvoiceId: 41 }, items, "INV-4", new Date())).toEqual({ alreadyConverted: true, invoiceId: 41 });
  });

  it("denies retrieval, deletion, and conversion attempts from a different authenticated workspace", () => {
    const foreignQuote = { id: 17, userId: 200 };
    expect(() => assertQuoteWorkspace(88, foreignQuote)).toThrow("workspace");
    expect(() => assertQuoteWorkspace(88, undefined)).toThrow("workspace");
    expect(() => assertQuoteWorkspace(200, foreignQuote)).not.toThrow();
  });
});
