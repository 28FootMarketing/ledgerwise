import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  createExpense: vi.fn(),
  createManualJournalEntry: vi.fn(),
  getTagSummary: vi.fn(),
  getProfitAndLoss: vi.fn(),
}));

import * as db from "./db";
import { accountingRouter } from "./routers/accounting";

const context = {
  user: { id: 77, openId: "tag-owner", name: "Tag Owner", email: "owner@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} },
  res: {},
} as any;

describe("protected custom tag procedures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates and deletes tags only in the authenticated user workspace", async () => {
    const caller = accountingRouter.createCaller(context);
    await caller.tags.create({ name: "Client A" });
    await caller.tags.delete({ id: 12 });
    expect(db.createTag).toHaveBeenCalledWith(77, "Client A");
    expect(db.deleteTag).toHaveBeenCalledWith(77, 12);
  });

  it("passes selected category and custom tag IDs to a new expense transaction", async () => {
    const caller = accountingRouter.createCaller(context);
    const occurredAt = new Date("2026-08-20T12:00:00.000Z");
    await caller.expenses.create({ vendorId: null, expenseAccountId: 501, paymentAccountId: 100, amountCents: 7800, incurredAt: occurredAt, notes: "Conference supplies", tagIds: [3, 5] });
    expect(db.createExpense).toHaveBeenCalledWith(expect.objectContaining({ userId: 77, expenseAccountId: 501, tagIds: [3, 5], amountCents: 7800 }));
  });

  it("passes custom tags through to a balanced manual ledger transaction", async () => {
    const caller = accountingRouter.createCaller(context);
    const postedAt = new Date("2026-08-20T12:00:00.000Z");
    await caller.ledger.create({ postedAt, memo: "Owner reimbursement", tagIds: [3], lines: [{ accountId: 100, debitCents: 5000, creditCents: 0 }, { accountId: 300, debitCents: 0, creditCents: 5000 }] });
    expect(db.createManualJournalEntry).toHaveBeenCalledWith(expect.objectContaining({ userId: 77, tagIds: [3] }));
  });

  it("scopes tag reporting requests to the authenticated user and chosen date range", async () => {
    const caller = accountingRouter.createCaller(context);
    const start = new Date("2026-08-01T00:00:00.000Z"); const end = new Date("2026-08-31T23:59:59.000Z");
    await caller.reports.tagSummary({ start, end });
    expect(db.getTagSummary).toHaveBeenCalledWith(77, { start, end });
  });

  it("scopes Profit & Loss requests to the authenticated user, date range, and selected tag", async () => {
    const caller = accountingRouter.createCaller(context);
    const start = new Date("2026-08-01T00:00:00.000Z"); const end = new Date("2026-08-31T23:59:59.000Z");
    await caller.reports.profitAndLoss({ start, end, tagId: 3 });
    expect(db.getProfitAndLoss).toHaveBeenCalledWith(77, { start, end, tagId: 3 });
  });

  it("denies tag access to an unauthenticated caller", async () => {
    const caller = accountingRouter.createCaller({ ...context, user: null });
    await expect(caller.tags.list()).rejects.toThrow("Please login");
  });
});
