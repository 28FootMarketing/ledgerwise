import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { nanoid } from "nanoid";
import { accounts, contacts, expenses, expenseTags, invoiceLineItems, invoices, journalEntries, journalEntryTags, journalLines, quoteLineItems, quotes, serviceCatalog, summaryDeliveries, summarySettings, tags, type AccountType, type InsertUser, users } from "../drizzle/schema";
import { calculateInvoiceTotals, calculateProfitAndLoss, effectiveInvoiceStatus, summarizeFinancials, validateBalancedJournalLines, type JournalLineDraft } from "./accountingMath";
import { calculateQuoteTotals, type QuoteLineDraft } from "./quoteMath";
import { assembleQuoteRecords, assertQuoteWorkspace, buildInvoiceFromQuote } from "./quoteService";
import { assertTagOwnership, attachPersistedTags, buildTagSummary, filterTransactionsByDate, filterTransactionsByTag, normalizeTagIds } from "./tagRules";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
// `prepare: false` is required against Supabase's pooled connection
// (port 6543 / pgbouncer transaction mode) — the pooler does not support
// server-side prepared statements across pooled connections, which is the
// mode Vercel serverless functions must use (no long-lived connections).
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.authUserId) {
    throw new Error("User authUserId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      authUserId: user.authUserId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.email === ENV.ownerEmail) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    updateSet.updatedAt = new Date();
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.authUserId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByAuthUserId(authUserId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.authUserId, authUserId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

const systemAccounts: Array<{ code: string; name: string; type: AccountType }> = [
  { code: "1000", name: "Operating Cash", type: "asset" },
  { code: "1100", name: "Accounts Receivable", type: "asset" },
  { code: "2000", name: "Accounts Payable", type: "liability" },
  { code: "3000", name: "Owner's Equity", type: "equity" },
  { code: "4000", name: "Sales Revenue", type: "income" },
  { code: "5000", name: "General Expenses", type: "expense" },
];

export async function ensureLedgerSetup(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(accounts).values(systemAccounts.map(account => ({ ...account, userId, isSystem: "yes" as const }))).onConflictDoUpdate({
    target: [accounts.userId, accounts.code],
    set: { updatedAt: new Date() },
  });
}

export async function listContacts(userId: number, kind?: "customer" | "vendor") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return kind
    ? db.select().from(contacts).where(and(eq(contacts.userId, userId), eq(contacts.kind, kind))).orderBy(desc(contacts.createdAt))
    : db.select().from(contacts).where(eq(contacts.userId, userId)).orderBy(desc(contacts.createdAt));
}

export async function createContact(input: { userId: number; kind: "customer" | "vendor"; name: string; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(contacts).values(input);
}

export async function updateContact(userId: number, id: number, input: { name: string; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(contacts).set({ ...input, updatedAt: new Date() }).where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
}

export async function listAccounts(userId: number) {
  await ensureLedgerSetup(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.code);
}

export async function listAccountsWithBalances(userId: number) {
  const [accountRows, lineRows] = await Promise.all([
    listAccounts(userId),
    (async () => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      return db.select({ accountId: journalLines.accountId, debitCents: journalLines.debitCents, creditCents: journalLines.creditCents })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
        .where(eq(journalEntries.userId, userId));
    })(),
  ]);
  const movements = new Map<number, { debits: number; credits: number }>();
  lineRows.forEach(line => {
    const current = movements.get(line.accountId) ?? { debits: 0, credits: 0 };
    current.debits += line.debitCents;
    current.credits += line.creditCents;
    movements.set(line.accountId, current);
  });
  return accountRows.map(account => {
    const movement = movements.get(account.id) ?? { debits: 0, credits: 0 };
    const debitNormal = account.type === "asset" || account.type === "expense";
    return { ...account, balanceCents: debitNormal ? movement.debits - movement.credits : movement.credits - movement.debits };
  });
}

export async function createAccount(input: { userId: number; code: string; name: string; type: AccountType; description?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(accounts).values({ ...input, isSystem: "no" });
}

export async function listTags(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.name);
}

export async function createTag(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(tags).values({ userId, name: name.trim() });
}

export async function deleteTag(userId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const owned = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId))).limit(1);
  if (!owned[0]) throw new Error("This tag is not in your workspace.");
  await db.delete(expenseTags).where(eq(expenseTags.tagId, tagId));
  await db.delete(journalEntryTags).where(eq(journalEntryTags.tagId, tagId));
  await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
}

async function assertOwnedTags(userId: number, tagIds: number[]) {
  if (!tagIds.length) return;
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const owned = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
  assertTagOwnership(tagIds, owned.map(tag => tag.id));
}

async function assertOwnedAccounts(userId: number, accountIds: number[]) {
  const rows = await listAccounts(userId);
  const owned = new Set(rows.map(account => account.id));
  if (accountIds.some(accountId => !owned.has(accountId))) throw new Error("A journal line uses an account outside your ledger.");
}

async function insertBalancedJournalEntry(input: { userId: number; postedAt: Date; memo?: string | null; sourceType: "manual" | "invoice" | "expense" | "payment"; sourceId?: number | null; lines: JournalLineDraft[] }) {
  validateBalancedJournalLines(input.lines);
  await assertOwnedAccounts(input.userId, input.lines.map(line => line.accountId));
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const [inserted] = await db.insert(journalEntries).values({ userId: input.userId, postedAt: input.postedAt, memo: input.memo ?? null, sourceType: input.sourceType, sourceId: input.sourceId ?? null }).returning({ id: journalEntries.id });
  const journalEntryId = inserted?.id;
  if (!journalEntryId) throw new Error("Could not create the journal entry.");
  await db.insert(journalLines).values(input.lines.map(line => ({ ...line, journalEntryId })));
  return journalEntryId;
}

export async function createManualJournalEntry(input: { userId: number; postedAt: Date; memo?: string | null; lines: JournalLineDraft[]; tagIds?: number[] }) {
  const tagIds = normalizeTagIds(input.tagIds ?? []);
  await assertOwnedTags(input.userId, tagIds);
  const journalEntryId = await insertBalancedJournalEntry({ userId: input.userId, postedAt: input.postedAt, memo: input.memo, lines: input.lines, sourceType: "manual" });
  if (tagIds.length) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable.");
    await db.insert(journalEntryTags).values(tagIds.map(tagId => ({ journalEntryId, tagId })));
  }
  return journalEntryId;
}

export async function listJournalEntries(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const entries = await db.select().from(journalEntries).where(eq(journalEntries.userId, userId)).orderBy(desc(journalEntries.postedAt));
  const lines = await Promise.all(entries.map(entry => db.select().from(journalLines).where(eq(journalLines.journalEntryId, entry.id))));
  if (!entries.length) return [];
  const assignments = await db.select({ journalEntryId: journalEntryTags.journalEntryId, id: tags.id, name: tags.name }).from(journalEntryTags).innerJoin(tags, eq(journalEntryTags.tagId, tags.id)).where(and(eq(tags.userId, userId), inArray(journalEntryTags.journalEntryId, entries.map(entry => entry.id))));
  return attachPersistedTags(entries.map((entry, index) => ({ ...entry, lines: lines[index] ?? [] })), assignments, "journalEntryId");
}

export async function createExpense(input: { userId: number; vendorId?: number | null; expenseAccountId: number; paymentAccountId: number; amountCents: number; incurredAt: Date; notes?: string | null; tagIds?: number[] }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Expense amounts must be positive whole cents.");
  const tagIds = normalizeTagIds(input.tagIds ?? []);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await assertOwnedAccounts(input.userId, [input.expenseAccountId, input.paymentAccountId]);
  await assertOwnedTags(input.userId, tagIds);
  if (input.vendorId) {
    const vendor = await db.select().from(contacts).where(and(eq(contacts.id, input.vendorId), eq(contacts.userId, input.userId), eq(contacts.kind, "vendor"))).limit(1);
    if (!vendor[0]) throw new Error("Choose a vendor from your own vendor directory.");
  }
  const { tagIds: _tagIds, ...expenseValues } = input;
  const [inserted] = await db.insert(expenses).values(expenseValues).returning({ id: expenses.id });
  const expenseId = inserted?.id;
  if (!expenseId) throw new Error("Could not create the expense.");
  if (tagIds.length) await db.insert(expenseTags).values(tagIds.map(tagId => ({ expenseId, tagId })));
  const journalEntryId = await insertBalancedJournalEntry({ userId: input.userId, postedAt: input.incurredAt, memo: input.notes ?? "Expense recorded", sourceType: "expense", sourceId: expenseId, lines: [
    { accountId: input.expenseAccountId, debitCents: input.amountCents, creditCents: 0, description: "Expense" },
    { accountId: input.paymentAccountId, debitCents: 0, creditCents: input.amountCents, description: "Payment" },
  ] });
  await db.update(expenses).set({ journalEntryId, updatedAt: new Date() }).where(and(eq(expenses.id, expenseId), eq(expenses.userId, input.userId)));
}

export async function listExpenses(userId: number, range?: { start: Date; end: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const where = range ? and(eq(expenses.userId, userId), gte(expenses.incurredAt, range.start), lte(expenses.incurredAt, range.end)) : eq(expenses.userId, userId);
  const expenseRows = await db.select().from(expenses).where(where).orderBy(desc(expenses.incurredAt));
  if (!expenseRows.length) return [];
  const assignments = await db.select({ expenseId: expenseTags.expenseId, id: tags.id, name: tags.name })
    .from(expenseTags)
    .innerJoin(tags, eq(expenseTags.tagId, tags.id))
    .where(and(eq(tags.userId, userId), inArray(expenseTags.expenseId, expenseRows.map(expense => expense.id))));
  return attachPersistedTags(expenseRows, assignments, "expenseId");
}

export async function createInvoice(input: { userId: number; customerId: number; number: string; issueAt: Date; dueAt: Date; notes?: string | null; taxCents?: number; items: Array<{ description: string; quantity: number; unitAmountCents: number }> }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const customer = await db.select().from(contacts).where(and(eq(contacts.id, input.customerId), eq(contacts.userId, input.userId), eq(contacts.kind, "customer"))).limit(1);
  if (!customer[0]) throw new Error("Choose a customer from your own customer directory.");
  const totals = calculateInvoiceTotals(input.items, input.taxCents ?? 0);
  const [inserted] = await db.insert(invoices).values({ userId: input.userId, customerId: input.customerId, number: input.number.trim(), publicToken: nanoid(24), issueAt: input.issueAt, dueAt: input.dueAt, notes: input.notes ?? null, subtotalCents: totals.subtotalCents, taxCents: totals.taxCents, totalCents: totals.totalCents }).returning({ id: invoices.id });
  const invoiceId = inserted?.id;
  if (!invoiceId) throw new Error("Could not create the invoice.");
  await db.insert(invoiceLineItems).values(totals.items.map(item => ({ ...item, invoiceId })));
  return invoiceId;
}

export async function listServices(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(serviceCatalog).where(and(eq(serviceCatalog.userId, userId), eq(serviceCatalog.isActive, "yes"))).orderBy(serviceCatalog.category, serviceCatalog.name);
}

export async function createService(input: { userId: number; name: string; category: string; description?: string | null; defaultUnitAmountCents: number; billingFrequency: "one_time" | "monthly" }) {
  if (!Number.isInteger(input.defaultUnitAmountCents) || input.defaultUnitAmountCents < 0) throw new Error("Service prices must be non-negative whole cents.");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(serviceCatalog).values({ ...input, name: input.name.trim(), category: input.category.trim(), description: input.description?.trim() || null });
}

export async function archiveService(userId: number, serviceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(serviceCatalog).set({ isActive: "no", updatedAt: new Date() }).where(and(eq(serviceCatalog.id, serviceId), eq(serviceCatalog.userId, userId)));
}

async function assertOwnedCustomer(userId: number, customerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const customer = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, customerId), eq(contacts.userId, userId), eq(contacts.kind, "customer"))).limit(1);
  if (!customer[0]) throw new Error("Choose a customer from your own customer directory.");
}

async function assertOwnedServices(userId: number, serviceIds: number[]) {
  if (!serviceIds.length) return;
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const owned = await db.select({ id: serviceCatalog.id }).from(serviceCatalog).where(and(eq(serviceCatalog.userId, userId), inArray(serviceCatalog.id, serviceIds)));
  if (owned.length !== serviceIds.length) throw new Error("One or more selected services are not in your catalog.");
}

export async function createQuote(input: { userId: number; customerId: number; number: string; title: string; issueAt: Date; validUntil?: Date | null; notes?: string | null; items: QuoteLineDraft[] }) {
  await assertOwnedCustomer(input.userId, input.customerId);
  const totals = calculateQuoteTotals(input.items);
  await assertOwnedServices(input.userId, totals.items.flatMap(item => item.serviceCatalogId ? [item.serviceCatalogId] : []));
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const [inserted] = await db.insert(quotes).values({ userId: input.userId, customerId: input.customerId, number: input.number.trim(), title: input.title.trim(), issueAt: input.issueAt, validUntil: input.validUntil ?? null, notes: input.notes?.trim() || null, oneTimeCents: totals.oneTimeCents, monthlyCents: totals.monthlyCents }).returning({ id: quotes.id });
  const quoteId = inserted?.id;
  if (!quoteId) throw new Error("Could not create the quote.");
  await db.insert(quoteLineItems).values(totals.items.map(item => ({ quoteId, serviceCatalogId: item.serviceCatalogId ?? null, description: item.description, category: item.category ?? null, quantity: item.quantity, unitAmountCents: item.unitAmountCents, lineTotalCents: item.lineTotalCents, billingFrequency: item.billingFrequency })));
  return quoteId;
}

export async function listQuotes(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const quoteRows = await db.select().from(quotes).where(eq(quotes.userId, userId)).orderBy(desc(quotes.issueAt));
  if (!quoteRows.length) return [];
  const [items, customers] = await Promise.all([
    db.select().from(quoteLineItems).where(inArray(quoteLineItems.quoteId, quoteRows.map(quote => quote.id))),
    db.select().from(contacts).where(and(eq(contacts.userId, userId), inArray(contacts.id, quoteRows.map(quote => quote.customerId)))),
  ]);
  return assembleQuoteRecords(quoteRows, items, customers);
}

export async function getQuote(userId: number, quoteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const quoteRows = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId))).limit(1);
  const quote = quoteRows[0]; if (!quote) return undefined; assertQuoteWorkspace(userId, quote);
  const [items, customer] = await Promise.all([db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, quote.id)), db.select().from(contacts).where(and(eq(contacts.id, quote.customerId), eq(contacts.userId, userId))).limit(1)]);
  return { ...quote, items, customer: customer[0] };
}

export async function deleteQuote(userId: number, quoteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const quoteRows = await db.select({ id: quotes.id, userId: quotes.userId, convertedInvoiceId: quotes.convertedInvoiceId }).from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId))).limit(1);
  const quote = quoteRows[0];
  assertQuoteWorkspace(userId, quote);
  if (quote.convertedInvoiceId) throw new Error("Converted quotes are retained with their source invoice.");
  await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quote.id));
  await db.delete(quotes).where(and(eq(quotes.id, quote.id), eq(quotes.userId, userId)));
}

export async function convertQuoteToInvoice(input: { userId: number; quoteId: number; invoiceNumber: string; dueAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const quoteRows = await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.userId, input.userId))).limit(1);
  const quote = quoteRows[0];
  assertQuoteWorkspace(input.userId, quote);
  const items = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, quote.id));
  const conversion = buildInvoiceFromQuote(quote, items, input.invoiceNumber, input.dueAt);
  if (conversion.alreadyConverted) return conversion;
  const invoiceId = await createInvoice({ userId: input.userId, ...conversion.input });
  await db.update(quotes).set({ status: "converted", convertedInvoiceId: invoiceId, updatedAt: new Date() }).where(and(eq(quotes.id, quote.id), eq(quotes.userId, input.userId)));
  return { invoiceId, alreadyConverted: false };
}

export async function listInvoices(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.issueAt));
  return rows.map(invoice => ({ ...invoice, displayStatus: effectiveInvoiceStatus(invoice.status, invoice.dueAt) }));
}

export async function getInvoice(userId: number, invoiceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const invoice = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId))).limit(1);
  if (!invoice[0]) return undefined;
  const [items, customer] = await Promise.all([
    db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId)),
    db.select().from(contacts).where(and(eq(contacts.id, invoice[0].customerId), eq(contacts.userId, userId))).limit(1),
  ]);
  return { ...invoice[0], displayStatus: effectiveInvoiceStatus(invoice[0].status, invoice[0].dueAt), items, customer: customer[0] };
}

export async function getPublicInvoice(publicToken: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const invoice = await db.select().from(invoices).where(eq(invoices.publicToken, publicToken)).limit(1);
  if (!invoice[0] || invoice[0].status === "draft") return undefined;
  const [items, customer] = await Promise.all([
    db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice[0].id)),
    db.select().from(contacts).where(eq(contacts.id, invoice[0].customerId)).limit(1),
  ]);
  return { ...invoice[0], displayStatus: effectiveInvoiceStatus(invoice[0].status, invoice[0].dueAt), items, customer: customer[0] };
}

export async function sendInvoice(userId: number, invoiceId: number) {
  await ensureLedgerSetup(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const invoice = await getInvoice(userId, invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be sent.");
  const rows = await listAccounts(userId);
  const receivable = rows.find(account => account.code === "1100");
  const revenue = rows.find(account => account.code === "4000");
  if (!receivable || !revenue) throw new Error("Required system accounts are unavailable.");
  const journalEntryId = await insertBalancedJournalEntry({ userId, postedAt: invoice.issueAt, memo: `Invoice ${invoice.number}`, sourceType: "invoice", sourceId: invoice.id, lines: [
    { accountId: receivable.id, debitCents: invoice.totalCents, creditCents: 0, description: "Accounts receivable" },
    { accountId: revenue.id, debitCents: 0, creditCents: invoice.totalCents, description: "Sales revenue" },
  ] });
  await db.update(invoices).set({ status: "sent", journalEntryId, updatedAt: new Date() }).where(and(eq(invoices.id, invoice.id), eq(invoices.userId, userId)));
}

export async function getFinancialSummary(userId: number, range?: { start: Date; end: Date; tagId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const invoiceWhere = range ? and(eq(invoices.userId, userId), gte(invoices.issueAt, range.start), lte(invoices.issueAt, range.end)) : eq(invoices.userId, userId);
  if (range?.tagId) await assertOwnedTags(userId, [range.tagId]);
  const [invoiceRows, expenseRows] = await Promise.all([db.select().from(invoices).where(invoiceWhere), listExpenses(userId, range ? { start: range.start, end: range.end } : undefined)]);
  return summarizeFinancials(invoiceRows, filterTransactionsByTag(expenseRows, range?.tagId));
}

export function calculateProfitAndLossFromRecords(summary: { revenueCents: number }, expenseRows: Array<{ expenseAccountId: number; amountCents: number; incurredAt: Date; tags: Array<{ id: number }> }>, accountRows: Array<{ id: number; code: string; name: string }>, range: { start: Date; end: Date; tagId?: number }) {
  const accountsById = new Map(accountRows.map(account => [account.id, account]));
  const selectedExpenses = filterTransactionsByTag(filterTransactionsByDate(expenseRows, range.start, range.end, "incurredAt"), range.tagId);
  const profitLossExpenses = selectedExpenses.map(expense => {
    const account = accountsById.get(expense.expenseAccountId);
    return { accountId: expense.expenseAccountId, accountCode: account?.code ?? "UNASSIGNED", accountName: account?.name ?? "Uncategorized expense", amountCents: expense.amountCents };
  });
  return calculateProfitAndLoss(summary.revenueCents, profitLossExpenses);
}

export async function getProfitAndLoss(userId: number, range: { start: Date; end: Date; tagId?: number }) {
  const [summary, expenseRows, accountRows] = await Promise.all([
    getFinancialSummary(userId, range),
    listExpenses(userId, { start: range.start, end: range.end }),
    listAccounts(userId),
  ]);
  return calculateProfitAndLossFromRecords(summary, expenseRows, accountRows, range);
}

export async function getTagSummary(userId: number, range?: { start: Date; end: Date; tagId?: number }) {
  const [tagRows, expenseRows, entryRows] = await Promise.all([
    listTags(userId),
    listExpenses(userId, range),
    listJournalEntries(userId),
  ]);
  const withinRangeEntries = range ? entryRows.filter(entry => entry.postedAt >= range.start && entry.postedAt <= range.end) : entryRows;
  if (range?.tagId) await assertOwnedTags(userId, [range.tagId]);
  return buildTagSummary(tagRows, expenseRows, withinRangeEntries, range?.tagId);
}

export async function setInvoiceCheckoutSession(userId: number, invoiceId: number, sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(invoices).set({ stripeCheckoutSessionId: sessionId, updatedAt: new Date() }).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
}

export async function markInvoicePaidByStripe(input: { invoiceId: number; checkoutSessionId?: string | null; paymentIntentId?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const found = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  const invoice = found[0];
  if (!invoice) throw new Error("Stripe payment referenced an unknown invoice.");
  if (invoice.status === "paid") return { alreadyPaid: true, invoiceId: invoice.id };
  if (invoice.status === "draft") throw new Error("A draft invoice cannot be settled.");
  const accountRows = await listAccounts(invoice.userId);
  const cash = accountRows.find(account => account.code === "1000");
  const receivable = accountRows.find(account => account.code === "1100");
  if (!cash || !receivable) throw new Error("Required payment accounts are unavailable.");
  const journalEntryId = await insertBalancedJournalEntry({
    userId: invoice.userId,
    postedAt: new Date(),
    memo: `Payment received for invoice ${invoice.number}`,
    sourceType: "payment",
    sourceId: invoice.id,
    lines: [
      { accountId: cash.id, debitCents: invoice.totalCents, creditCents: 0, description: "Cash received" },
      { accountId: receivable.id, debitCents: 0, creditCents: invoice.totalCents, description: "Accounts receivable settled" },
    ],
  });
  await db.update(invoices).set({
    status: "paid",
    paidAt: new Date(),
    journalEntryId,
    stripeCheckoutSessionId: input.checkoutSessionId ?? invoice.stripeCheckoutSessionId,
    stripePaymentIntentId: input.paymentIntentId ?? invoice.stripePaymentIntentId,
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoice.id));
  return { alreadyPaid: false, invoiceId: invoice.id };
}

export async function getAssistantContext(userId: number) {
  const [summary, invoiceRows, expenseRows, accountRows] = await Promise.all([
    getFinancialSummary(userId),
    listInvoices(userId),
    listExpenses(userId),
    listAccounts(userId),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    summary,
    invoices: invoiceRows.slice(0, 30).map(invoice => ({ number: invoice.number, status: invoice.displayStatus, issueAt: invoice.issueAt, dueAt: invoice.dueAt, totalCents: invoice.totalCents })),
    expenses: expenseRows.slice(0, 50).map(expense => ({ incurredAt: expense.incurredAt, amountCents: expense.amountCents, notes: expense.notes })),
    accounts: accountRows.map(account => ({ id: account.id, code: account.code, name: account.name, type: account.type })),
  };
}

export async function getSummarySettings(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select().from(summarySettings).where(eq(summarySettings.userId, userId)).limit(1);
  return rows[0];
}

export async function saveSummarySettings(input: { userId: number; recipientEmail: string; cadence: "weekly" | "monthly"; dayOfWeek: number; dayOfMonth: number; timezone: string; enabled: "yes" | "no" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(summarySettings).values(input).onConflictDoUpdate({
    target: summarySettings.userId,
    set: {
      recipientEmail: input.recipientEmail,
      cadence: input.cadence,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      timezone: input.timezone,
      enabled: input.enabled,
      updatedAt: new Date(),
    },
  });
}

/** All workspaces with scheduled delivery turned on — the daily cron scans this list and decides who is due today. */
export async function listEnabledSummarySettings() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(summarySettings).where(eq(summarySettings.enabled, "yes"));
}

export async function recordSummaryDelivery(input: { settingsId: number; periodStart: Date; periodEnd: Date; deliveryStatus: "sent" | "failed"; providerMessageId?: string | null; errorMessage?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(summaryDeliveries).values(input);
}

export async function hasSummaryDelivery(settingsId: number, periodStart: Date, periodEnd: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select({ id: summaryDeliveries.id }).from(summaryDeliveries).where(and(
    eq(summaryDeliveries.settingsId, settingsId),
    eq(summaryDeliveries.periodStart, periodStart),
    eq(summaryDeliveries.periodEnd, periodEnd),
    eq(summaryDeliveries.deliveryStatus, "sent"),
  )).limit(1);
  return Boolean(rows[0]);
}
