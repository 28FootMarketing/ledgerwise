import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ listServices: vi.fn(), createService: vi.fn(), archiveService: vi.fn(), listQuotes: vi.fn(), getQuote: vi.fn(), createQuote: vi.fn(), deleteQuote: vi.fn(), convertQuoteToInvoice: vi.fn() }));

import * as db from "./db";
import { quotesRouter } from "./routers/quotes";

const context = { user: { id: 88, authUserId: "00000000-0000-0000-0000-000000000088", name: "Quote Owner", email: "quotes@example.com", loginMethod: "email", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as any;

describe("protected quote procedures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates catalog services and quotes in the authenticated workspace", async () => {
    const caller = quotesRouter.createCaller(context);
    await caller.services.create({ name: "Design sprint", category: "Strategy", description: null, defaultUnitAmountCents: 95000, billingFrequency: "one_time" });
    await caller.quotes.create({ customerId: 4, number: "Q-100", title: "Website scope", issueAt: new Date("2026-08-20T12:00:00Z"), validUntil: null, notes: null, items: [{ serviceCatalogId: 2, description: "Design sprint", category: "Strategy", quantity: 1, unitAmountCents: 95000, billingFrequency: "one_time" }] });
    expect(db.createService).toHaveBeenCalledWith(expect.objectContaining({ userId: 88, name: "Design sprint" }));
    expect(db.createQuote).toHaveBeenCalledWith(expect.objectContaining({ userId: 88, customerId: 4, number: "Q-100" }));
  });

  it("converts a quote to an invoice only in the authenticated workspace", async () => {
    const caller = quotesRouter.createCaller(context);
    const dueAt = new Date("2026-09-20T12:00:00Z");
    await caller.quotes.convertToInvoice({ quoteId: 15, invoiceNumber: "INV-100", dueAt });
    expect(db.convertQuoteToInvoice).toHaveBeenCalledWith({ userId: 88, quoteId: 15, invoiceNumber: "INV-100", dueAt });
  });

  it("scopes saved-quote retrieval and deletion to the authenticated workspace", async () => {
    const caller = quotesRouter.createCaller(context);
    vi.mocked(db.getQuote).mockResolvedValueOnce({ id: 15, userId: 88 } as any);
    await caller.quotes.get({ id: 15 });
    await caller.quotes.delete({ id: 15 });
    expect(db.getQuote).toHaveBeenCalledWith(88, 15);
    expect(db.deleteQuote).toHaveBeenCalledWith(88, 15);
  });

  it("rejects quote management without an authenticated user", async () => {
    const unauthenticated = quotesRouter.createCaller({ ...context, user: null });
    await expect(unauthenticated.quotes.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects saved-quote retrieval, deletion, and conversion from a different authenticated workspace", async () => {
    const foreignCaller = quotesRouter.createCaller({ ...context, user: { ...context.user, id: 99, authUserId: "00000000-0000-0000-0000-000000000099" } });
    vi.mocked(db.getQuote).mockResolvedValueOnce(undefined as any);
    vi.mocked(db.deleteQuote).mockRejectedValueOnce(new Error("Quote not found in this workspace."));
    vi.mocked(db.convertQuoteToInvoice).mockRejectedValueOnce(new Error("Quote not found in this workspace."));
    await expect(foreignCaller.quotes.get({ id: 15 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(foreignCaller.quotes.delete({ id: 15 })).rejects.toThrow("workspace");
    await expect(foreignCaller.quotes.convertToInvoice({ quoteId: 15, invoiceNumber: "INV-100", dueAt: new Date("2026-09-20T12:00:00Z") })).rejects.toThrow("workspace");
    expect(db.getQuote).toHaveBeenCalledWith(99, 15);
    expect(db.deleteQuote).toHaveBeenCalledWith(99, 15);
    expect(db.convertQuoteToInvoice).toHaveBeenCalledWith(expect.objectContaining({ userId: 99, quoteId: 15 }));
  });
});
