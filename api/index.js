// server/_core/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";

// drizzle/schema.ts
import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("contactKind", ["customer", "vendor"]).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 48 }),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("contacts_user_kind_idx").on(table.userId, table.kind)]);
var accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  code: varchar("code", { length: 24 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: mysqlEnum("accountType", ["asset", "liability", "equity", "income", "expense"]).notNull(),
  description: text("description"),
  isSystem: mysqlEnum("isSystem", ["yes", "no"]).default("no").notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  uniqueIndex("accounts_user_code_unique").on(table.userId, table.code),
  index("accounts_user_type_idx").on(table.userId, table.type)
]);
var journalEntries = mysqlTable("journalEntries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  postedAt: timestamp("postedAt").notNull(),
  memo: varchar("memo", { length: 280 }),
  sourceType: mysqlEnum("journalSourceType", ["manual", "invoice", "expense", "payment"]).default("manual").notNull(),
  sourceId: int("sourceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [index("journal_entries_user_date_idx").on(table.userId, table.postedAt)]);
var journalLines = mysqlTable("journalLines", {
  id: int("id").autoincrement().primaryKey(),
  journalEntryId: int("journalEntryId").notNull(),
  accountId: int("accountId").notNull(),
  debitCents: int("debitCents").default(0).notNull(),
  creditCents: int("creditCents").default(0).notNull(),
  description: varchar("description", { length: 280 })
}, (table) => [
  index("journal_lines_entry_idx").on(table.journalEntryId),
  index("journal_lines_account_idx").on(table.accountId)
]);
var invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  customerId: int("customerId").notNull(),
  number: varchar("number", { length: 48 }).notNull(),
  publicToken: varchar("publicToken", { length: 32 }).notNull(),
  status: mysqlEnum("invoiceStatus", ["draft", "sent", "paid", "overdue"]).default("draft").notNull(),
  issueAt: timestamp("issueAt").notNull(),
  dueAt: timestamp("dueAt").notNull(),
  subtotalCents: int("subtotalCents").default(0).notNull(),
  taxCents: int("taxCents").default(0).notNull(),
  totalCents: int("totalCents").default(0).notNull(),
  notes: text("notes"),
  journalEntryId: int("journalEntryId"),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 255 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  uniqueIndex("invoices_user_number_unique").on(table.userId, table.number),
  uniqueIndex("invoices_public_token_unique").on(table.publicToken),
  index("invoices_user_status_idx").on(table.userId, table.status),
  index("invoices_customer_idx").on(table.customerId)
]);
var invoiceLineItems = mysqlTable("invoiceLineItems", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  description: varchar("description", { length: 280 }).notNull(),
  quantity: int("quantity").notNull(),
  unitAmountCents: int("unitAmountCents").notNull(),
  lineTotalCents: int("lineTotalCents").notNull()
}, (table) => [index("invoice_items_invoice_idx").on(table.invoiceId)]);
var serviceCatalog = mysqlTable("serviceCatalog", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  category: varchar("category", { length: 96 }).notNull(),
  description: text("description"),
  defaultUnitAmountCents: int("defaultUnitAmountCents").notNull(),
  billingFrequency: mysqlEnum("serviceBillingFrequency", ["one_time", "monthly"]).default("one_time").notNull(),
  isActive: mysqlEnum("serviceActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  index("services_user_category_idx").on(table.userId, table.category),
  index("services_user_active_idx").on(table.userId, table.isActive)
]);
var quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  customerId: int("customerId").notNull(),
  number: varchar("number", { length: 48 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  status: mysqlEnum("quoteStatus", ["draft", "sent", "accepted", "declined", "converted"]).default("draft").notNull(),
  issueAt: timestamp("issueAt").notNull(),
  validUntil: timestamp("validUntil"),
  notes: text("notes"),
  oneTimeCents: int("oneTimeCents").default(0).notNull(),
  monthlyCents: int("monthlyCents").default(0).notNull(),
  convertedInvoiceId: int("convertedInvoiceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  uniqueIndex("quotes_user_number_unique").on(table.userId, table.number),
  index("quotes_user_status_idx").on(table.userId, table.status),
  index("quotes_customer_idx").on(table.customerId)
]);
var quoteLineItems = mysqlTable("quoteLineItems", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull(),
  serviceCatalogId: int("serviceCatalogId"),
  description: varchar("description", { length: 280 }).notNull(),
  category: varchar("category", { length: 96 }),
  quantity: int("quantity").notNull(),
  unitAmountCents: int("unitAmountCents").notNull(),
  lineTotalCents: int("lineTotalCents").notNull(),
  billingFrequency: mysqlEnum("quoteBillingFrequency", ["one_time", "monthly"]).default("one_time").notNull()
}, (table) => [
  index("quote_items_quote_idx").on(table.quoteId),
  index("quote_items_service_idx").on(table.serviceCatalogId)
]);
var expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  vendorId: int("vendorId"),
  expenseAccountId: int("expenseAccountId").notNull(),
  paymentAccountId: int("paymentAccountId").notNull(),
  amountCents: int("amountCents").notNull(),
  incurredAt: timestamp("incurredAt").notNull(),
  notes: text("notes"),
  journalEntryId: int("journalEntryId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("expenses_user_date_idx").on(table.userId, table.incurredAt)]);
var tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => [
  uniqueIndex("tags_user_name_unique").on(table.userId, table.name),
  index("tags_user_idx").on(table.userId)
]);
var expenseTags = mysqlTable("expenseTags", {
  id: int("id").autoincrement().primaryKey(),
  expenseId: int("expenseId").notNull(),
  tagId: int("tagId").notNull()
}, (table) => [
  uniqueIndex("expense_tags_unique").on(table.expenseId, table.tagId),
  index("expense_tags_tag_idx").on(table.tagId)
]);
var journalEntryTags = mysqlTable("journalEntryTags", {
  id: int("id").autoincrement().primaryKey(),
  journalEntryId: int("journalEntryId").notNull(),
  tagId: int("tagId").notNull()
}, (table) => [
  uniqueIndex("journal_entry_tags_unique").on(table.journalEntryId, table.tagId),
  index("journal_entry_tags_tag_idx").on(table.tagId)
]);
var summarySettings = mysqlTable("summarySettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  cadence: mysqlEnum("summaryCadence", ["weekly", "monthly"]).default("monthly").notNull(),
  dayOfWeek: int("dayOfWeek").default(1).notNull(),
  dayOfMonth: int("dayOfMonth").default(1).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
  enabled: mysqlEnum("summaryEnabled", ["yes", "no"]).default("no").notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("summary_schedule_uid_idx").on(table.scheduleCronTaskUid)]);
var summaryDeliveries = mysqlTable("summaryDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  settingsId: int("settingsId").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  deliveryStatus: mysqlEnum("summaryDeliveryStatus", ["sent", "failed"]).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  errorMessage: text("errorMessage")
}, (table) => [index("summary_deliveries_settings_idx").on(table.settingsId, table.sentAt)]);

// server/accountingMath.ts
function calculateInvoiceTotals(items, taxCents = 0) {
  if (!Number.isInteger(taxCents) || taxCents < 0) {
    throw new Error("Tax must be a non-negative whole number of cents.");
  }
  const normalizedItems = items.map((item) => {
    if (!item.description.trim()) throw new Error("Each invoice line requires a description.");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Invoice quantities must be positive whole numbers.");
    }
    if (!Number.isInteger(item.unitAmountCents) || item.unitAmountCents < 0) {
      throw new Error("Invoice unit amounts must be non-negative whole cents.");
    }
    return { ...item, lineTotalCents: item.quantity * item.unitAmountCents };
  });
  const subtotalCents = normalizedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  return { items: normalizedItems, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}
function validateBalancedJournalLines(lines) {
  if (lines.length < 2) throw new Error("A journal entry needs at least two lines.");
  const debitCents = lines.reduce((sum, line) => sum + line.debitCents, 0);
  const creditCents = lines.reduce((sum, line) => sum + line.creditCents, 0);
  lines.forEach((line) => {
    const hasDebit = Number.isInteger(line.debitCents) && line.debitCents > 0;
    const hasCredit = Number.isInteger(line.creditCents) && line.creditCents > 0;
    if (hasDebit === hasCredit) {
      throw new Error("Each journal line must contain either a debit or a credit, but not both.");
    }
  });
  if (debitCents !== creditCents) {
    throw new Error("Journal entry debits and credits must balance.");
  }
  return { debitCents, creditCents };
}
function effectiveInvoiceStatus(status, dueAt, referenceDate = /* @__PURE__ */ new Date()) {
  if (status === "sent" && dueAt.getTime() < referenceDate.getTime()) return "overdue";
  return status;
}
function summarizeFinancials(invoices2, expenseRows, referenceDate = /* @__PURE__ */ new Date()) {
  const revenueCents = invoices2.filter((invoice) => effectiveInvoiceStatus(invoice.status, invoice.dueAt, referenceDate) !== "draft").reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const outstandingCents = invoices2.filter((invoice) => {
    const status = effectiveInvoiceStatus(invoice.status, invoice.dueAt, referenceDate);
    return status === "sent" || status === "overdue";
  }).reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const expensesCents = expenseRows.reduce((sum, expense) => sum + expense.amountCents, 0);
  return {
    revenueCents,
    expensesCents,
    netProfitCents: revenueCents - expensesCents,
    outstandingCents,
    invoiceCount: invoices2.length
  };
}
function isCostOfGoodsSoldAccount(account) {
  const label = account.accountName.toLowerCase();
  return account.accountCode.startsWith("51") || label.includes("cost of goods") || label.includes("cogs");
}
function groupProfitLossLines(lines) {
  const grouped = /* @__PURE__ */ new Map();
  lines.forEach((line) => {
    const key = `${line.accountId}:${line.accountCode}`;
    const current = grouped.get(key) ?? { accountId: line.accountId, code: line.accountCode, name: line.accountName, amountCents: 0 };
    current.amountCents += line.amountCents;
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((left, right) => left.code.localeCompare(right.code));
}
function calculateProfitAndLoss(revenueCents, expenseRows) {
  const costOfGoodsSold = groupProfitLossLines(expenseRows.filter(isCostOfGoodsSoldAccount));
  const operatingExpenses = groupProfitLossLines(expenseRows.filter((expense) => !isCostOfGoodsSoldAccount(expense)));
  const costOfGoodsSoldCents = costOfGoodsSold.reduce((sum, row) => sum + row.amountCents, 0);
  const operatingExpenseCents = operatingExpenses.reduce((sum, row) => sum + row.amountCents, 0);
  const grossProfitCents = revenueCents - costOfGoodsSoldCents;
  const operatingProfitCents = grossProfitCents - operatingExpenseCents;
  return { revenueCents, revenue: [{ code: "4000", name: "Sales revenue", amountCents: revenueCents }], costOfGoodsSold, costOfGoodsSoldCents, grossProfitCents, operatingExpenses, operatingExpenseCents, operatingProfitCents, netProfitCents: operatingProfitCents };
}

// server/quoteMath.ts
function calculateQuoteTotals(items) {
  if (!items.length) throw new Error("A quote needs at least one line item.");
  const normalized = items.map((item) => {
    if (!item.description.trim()) throw new Error("Each quote line needs a description.");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("Quote quantities must be positive whole numbers.");
    if (!Number.isInteger(item.unitAmountCents) || item.unitAmountCents < 0) throw new Error("Quote prices must be non-negative whole cents.");
    return { ...item, description: item.description.trim(), lineTotalCents: item.quantity * item.unitAmountCents };
  });
  return { items: normalized, oneTimeCents: normalized.filter((item) => item.billingFrequency === "one_time").reduce((sum, item) => sum + item.lineTotalCents, 0), monthlyCents: normalized.filter((item) => item.billingFrequency === "monthly").reduce((sum, item) => sum + item.lineTotalCents, 0) };
}

// server/quoteService.ts
function assertQuoteWorkspace(userId, quote) {
  if (!quote || quote.userId !== userId) throw new Error("Quote not found in this workspace.");
}
function assembleQuoteRecords(quotes2, items, customers) {
  const itemsByQuote = /* @__PURE__ */ new Map();
  items.forEach((item) => itemsByQuote.set(item.quoteId, [...itemsByQuote.get(item.quoteId) ?? [], item]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  return quotes2.map((quote) => ({ ...quote, items: itemsByQuote.get(quote.id) ?? [], customer: customerById.get(quote.customerId) }));
}
function buildInvoiceFromQuote(quote, items, invoiceNumber, dueAt) {
  if (quote.convertedInvoiceId) return { alreadyConverted: true, invoiceId: quote.convertedInvoiceId };
  if (!items.length) throw new Error("A quote needs at least one line item before conversion.");
  return { alreadyConverted: false, input: { customerId: quote.customerId, number: invoiceNumber, issueAt: quote.issueAt, dueAt, notes: [quote.notes, quote.monthlyCents ? "Monthly services shown as the first billing period." : null].filter(Boolean).join("\n") || null, items: items.map((item) => ({ description: item.billingFrequency === "monthly" ? `${item.description} (monthly)` : item.description, quantity: item.quantity, unitAmountCents: item.unitAmountCents })) } };
}

// server/tagRules.ts
function normalizeTagIds(tagIds) {
  const normalized = Array.from(new Set(tagIds));
  if (normalized.some((tagId) => !Number.isInteger(tagId) || tagId <= 0)) throw new Error("Tags must use valid identifiers.");
  if (normalized.length > 12) throw new Error("A transaction can have up to 12 custom tags.");
  return normalized;
}
function assertTagOwnership(requestedTagIds, ownedTagIds) {
  const requested = normalizeTagIds(requestedTagIds);
  const owned = new Set(ownedTagIds);
  if (requested.some((tagId) => !owned.has(tagId))) throw new Error("One or more tags are not in your workspace.");
  return requested;
}
function filterTransactionsByTag(transactions, tagId) {
  return tagId ? transactions.filter((transaction) => transaction.tags.some((tag) => tag.id === tagId)) : transactions;
}
function filterTransactionsByDate(transactions, start, end, dateKey) {
  return transactions.filter((transaction) => {
    const value = transaction[dateKey];
    return value instanceof Date && value >= start && value <= end;
  });
}
function attachPersistedTags(transactions, assignments, transactionKey) {
  const tagsByTransaction = /* @__PURE__ */ new Map();
  assignments.forEach((assignment) => {
    const transactionId = assignment[transactionKey];
    tagsByTransaction.set(transactionId, [...tagsByTransaction.get(transactionId) ?? [], { id: assignment.id, name: assignment.name }]);
  });
  return transactions.map((transaction) => ({ ...transaction, tags: tagsByTransaction.get(transaction.id) ?? [] }));
}
function buildTagSummary(tagRows, expenses2, entries, selectedTagId) {
  return tagRows.filter((tag) => !selectedTagId || tag.id === selectedTagId).map((tag) => ({
    ...tag,
    expenseCents: filterTransactionsByTag(expenses2, tag.id).reduce((total, expense) => total + expense.amountCents, 0),
    manualEntryCount: filterTransactionsByTag(entries, tag.id).filter((entry) => entry.sourceType === "manual").length
  }));
}

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
var systemAccounts = [
  { code: "1000", name: "Operating Cash", type: "asset" },
  { code: "1100", name: "Accounts Receivable", type: "asset" },
  { code: "2000", name: "Accounts Payable", type: "liability" },
  { code: "3000", name: "Owner's Equity", type: "equity" },
  { code: "4000", name: "Sales Revenue", type: "income" },
  { code: "5000", name: "General Expenses", type: "expense" }
];
async function ensureLedgerSetup(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(accounts).values(systemAccounts.map((account) => ({ ...account, userId, isSystem: "yes" }))).onDuplicateKeyUpdate({
    set: { updatedAt: /* @__PURE__ */ new Date() }
  });
}
async function listContacts(userId, kind) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return kind ? db.select().from(contacts).where(and(eq(contacts.userId, userId), eq(contacts.kind, kind))).orderBy(desc(contacts.createdAt)) : db.select().from(contacts).where(eq(contacts.userId, userId)).orderBy(desc(contacts.createdAt));
}
async function createContact(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(contacts).values(input);
}
async function updateContact(userId, id3, input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(contacts).set(input).where(and(eq(contacts.id, id3), eq(contacts.userId, userId)));
}
async function listAccounts(userId) {
  await ensureLedgerSetup(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.code);
}
async function listAccountsWithBalances(userId) {
  const [accountRows, lineRows] = await Promise.all([
    listAccounts(userId),
    (async () => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable.");
      return db.select({ accountId: journalLines.accountId, debitCents: journalLines.debitCents, creditCents: journalLines.creditCents }).from(journalLines).innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id)).where(eq(journalEntries.userId, userId));
    })()
  ]);
  const movements = /* @__PURE__ */ new Map();
  lineRows.forEach((line) => {
    const current = movements.get(line.accountId) ?? { debits: 0, credits: 0 };
    current.debits += line.debitCents;
    current.credits += line.creditCents;
    movements.set(line.accountId, current);
  });
  return accountRows.map((account) => {
    const movement = movements.get(account.id) ?? { debits: 0, credits: 0 };
    const debitNormal = account.type === "asset" || account.type === "expense";
    return { ...account, balanceCents: debitNormal ? movement.debits - movement.credits : movement.credits - movement.debits };
  });
}
async function createAccount(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(accounts).values({ ...input, isSystem: "no" });
}
async function listTags(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.name);
}
async function createTag(userId, name) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(tags).values({ userId, name: name.trim() });
}
async function deleteTag(userId, tagId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const owned = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId))).limit(1);
  if (!owned[0]) throw new Error("This tag is not in your workspace.");
  await db.delete(expenseTags).where(eq(expenseTags.tagId, tagId));
  await db.delete(journalEntryTags).where(eq(journalEntryTags.tagId, tagId));
  await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
}
async function assertOwnedTags(userId, tagIds) {
  if (!tagIds.length) return;
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const owned = await db.select({ id: tags.id }).from(tags).where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
  assertTagOwnership(tagIds, owned.map((tag) => tag.id));
}
async function assertOwnedAccounts(userId, accountIds) {
  const rows = await listAccounts(userId);
  const owned = new Set(rows.map((account) => account.id));
  if (accountIds.some((accountId) => !owned.has(accountId))) throw new Error("A journal line uses an account outside your ledger.");
}
async function insertBalancedJournalEntry(input) {
  validateBalancedJournalLines(input.lines);
  await assertOwnedAccounts(input.userId, input.lines.map((line) => line.accountId));
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const result = await db.insert(journalEntries).values({ userId: input.userId, postedAt: input.postedAt, memo: input.memo ?? null, sourceType: input.sourceType, sourceId: input.sourceId ?? null });
  const journalEntryId = Number(result.insertId ?? result[0]?.insertId);
  if (!journalEntryId) throw new Error("Could not create the journal entry.");
  await db.insert(journalLines).values(input.lines.map((line) => ({ ...line, journalEntryId })));
  return journalEntryId;
}
async function createManualJournalEntry(input) {
  const tagIds = normalizeTagIds(input.tagIds ?? []);
  await assertOwnedTags(input.userId, tagIds);
  const journalEntryId = await insertBalancedJournalEntry({ userId: input.userId, postedAt: input.postedAt, memo: input.memo, lines: input.lines, sourceType: "manual" });
  if (tagIds.length) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable.");
    await db.insert(journalEntryTags).values(tagIds.map((tagId) => ({ journalEntryId, tagId })));
  }
  return journalEntryId;
}
async function listJournalEntries(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const entries = await db.select().from(journalEntries).where(eq(journalEntries.userId, userId)).orderBy(desc(journalEntries.postedAt));
  const lines = await Promise.all(entries.map((entry) => db.select().from(journalLines).where(eq(journalLines.journalEntryId, entry.id))));
  if (!entries.length) return [];
  const assignments = await db.select({ journalEntryId: journalEntryTags.journalEntryId, id: tags.id, name: tags.name }).from(journalEntryTags).innerJoin(tags, eq(journalEntryTags.tagId, tags.id)).where(and(eq(tags.userId, userId), inArray(journalEntryTags.journalEntryId, entries.map((entry) => entry.id))));
  return attachPersistedTags(entries.map((entry, index2) => ({ ...entry, lines: lines[index2] ?? [] })), assignments, "journalEntryId");
}
async function createExpense(input) {
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
  const result = await db.insert(expenses).values(expenseValues);
  const expenseId = Number(result.insertId ?? result[0]?.insertId);
  if (tagIds.length) await db.insert(expenseTags).values(tagIds.map((tagId) => ({ expenseId, tagId })));
  const journalEntryId = await insertBalancedJournalEntry({ userId: input.userId, postedAt: input.incurredAt, memo: input.notes ?? "Expense recorded", sourceType: "expense", sourceId: expenseId, lines: [
    { accountId: input.expenseAccountId, debitCents: input.amountCents, creditCents: 0, description: "Expense" },
    { accountId: input.paymentAccountId, debitCents: 0, creditCents: input.amountCents, description: "Payment" }
  ] });
  await db.update(expenses).set({ journalEntryId }).where(and(eq(expenses.id, expenseId), eq(expenses.userId, input.userId)));
}
async function listExpenses(userId, range) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const where = range ? and(eq(expenses.userId, userId), gte(expenses.incurredAt, range.start), lte(expenses.incurredAt, range.end)) : eq(expenses.userId, userId);
  const expenseRows = await db.select().from(expenses).where(where).orderBy(desc(expenses.incurredAt));
  if (!expenseRows.length) return [];
  const assignments = await db.select({ expenseId: expenseTags.expenseId, id: tags.id, name: tags.name }).from(expenseTags).innerJoin(tags, eq(expenseTags.tagId, tags.id)).where(and(eq(tags.userId, userId), inArray(expenseTags.expenseId, expenseRows.map((expense) => expense.id))));
  return attachPersistedTags(expenseRows, assignments, "expenseId");
}
async function createInvoice(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const customer = await db.select().from(contacts).where(and(eq(contacts.id, input.customerId), eq(contacts.userId, input.userId), eq(contacts.kind, "customer"))).limit(1);
  if (!customer[0]) throw new Error("Choose a customer from your own customer directory.");
  const totals = calculateInvoiceTotals(input.items, input.taxCents ?? 0);
  const result = await db.insert(invoices).values({ userId: input.userId, customerId: input.customerId, number: input.number.trim(), publicToken: nanoid(24), issueAt: input.issueAt, dueAt: input.dueAt, notes: input.notes ?? null, subtotalCents: totals.subtotalCents, taxCents: totals.taxCents, totalCents: totals.totalCents });
  const invoiceId = Number(result.insertId ?? result[0]?.insertId);
  await db.insert(invoiceLineItems).values(totals.items.map((item) => ({ ...item, invoiceId })));
  return invoiceId;
}
async function listServices(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(serviceCatalog).where(and(eq(serviceCatalog.userId, userId), eq(serviceCatalog.isActive, "yes"))).orderBy(serviceCatalog.category, serviceCatalog.name);
}
async function createService(input) {
  if (!Number.isInteger(input.defaultUnitAmountCents) || input.defaultUnitAmountCents < 0) throw new Error("Service prices must be non-negative whole cents.");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(serviceCatalog).values({ ...input, name: input.name.trim(), category: input.category.trim(), description: input.description?.trim() || null });
}
async function archiveService(userId, serviceId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(serviceCatalog).set({ isActive: "no" }).where(and(eq(serviceCatalog.id, serviceId), eq(serviceCatalog.userId, userId)));
}
async function assertOwnedCustomer(userId, customerId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const customer = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, customerId), eq(contacts.userId, userId), eq(contacts.kind, "customer"))).limit(1);
  if (!customer[0]) throw new Error("Choose a customer from your own customer directory.");
}
async function assertOwnedServices(userId, serviceIds) {
  if (!serviceIds.length) return;
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const owned = await db.select({ id: serviceCatalog.id }).from(serviceCatalog).where(and(eq(serviceCatalog.userId, userId), inArray(serviceCatalog.id, serviceIds)));
  if (owned.length !== serviceIds.length) throw new Error("One or more selected services are not in your catalog.");
}
async function createQuote(input) {
  await assertOwnedCustomer(input.userId, input.customerId);
  const totals = calculateQuoteTotals(input.items);
  await assertOwnedServices(input.userId, totals.items.flatMap((item) => item.serviceCatalogId ? [item.serviceCatalogId] : []));
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const result = await db.insert(quotes).values({ userId: input.userId, customerId: input.customerId, number: input.number.trim(), title: input.title.trim(), issueAt: input.issueAt, validUntil: input.validUntil ?? null, notes: input.notes?.trim() || null, oneTimeCents: totals.oneTimeCents, monthlyCents: totals.monthlyCents });
  const quoteId = Number(result.insertId ?? result[0]?.insertId);
  if (!quoteId) throw new Error("Could not create the quote.");
  await db.insert(quoteLineItems).values(totals.items.map((item) => ({ quoteId, serviceCatalogId: item.serviceCatalogId ?? null, description: item.description, category: item.category ?? null, quantity: item.quantity, unitAmountCents: item.unitAmountCents, lineTotalCents: item.lineTotalCents, billingFrequency: item.billingFrequency })));
  return quoteId;
}
async function listQuotes(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const quoteRows = await db.select().from(quotes).where(eq(quotes.userId, userId)).orderBy(desc(quotes.issueAt));
  if (!quoteRows.length) return [];
  const [items, customers] = await Promise.all([
    db.select().from(quoteLineItems).where(inArray(quoteLineItems.quoteId, quoteRows.map((quote) => quote.id))),
    db.select().from(contacts).where(and(eq(contacts.userId, userId), inArray(contacts.id, quoteRows.map((quote) => quote.customerId))))
  ]);
  return assembleQuoteRecords(quoteRows, items, customers);
}
async function getQuote(userId, quoteId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const quoteRows = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId))).limit(1);
  const quote = quoteRows[0];
  if (!quote) return void 0;
  assertQuoteWorkspace(userId, quote);
  const [items, customer] = await Promise.all([db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, quote.id)), db.select().from(contacts).where(and(eq(contacts.id, quote.customerId), eq(contacts.userId, userId))).limit(1)]);
  return { ...quote, items, customer: customer[0] };
}
async function deleteQuote(userId, quoteId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const quoteRows = await db.select({ id: quotes.id, userId: quotes.userId, convertedInvoiceId: quotes.convertedInvoiceId }).from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.userId, userId))).limit(1);
  const quote = quoteRows[0];
  assertQuoteWorkspace(userId, quote);
  if (quote.convertedInvoiceId) throw new Error("Converted quotes are retained with their source invoice.");
  await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quote.id));
  await db.delete(quotes).where(and(eq(quotes.id, quote.id), eq(quotes.userId, userId)));
}
async function convertQuoteToInvoice(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const quoteRows = await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.userId, input.userId))).limit(1);
  const quote = quoteRows[0];
  assertQuoteWorkspace(input.userId, quote);
  const items = await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, quote.id));
  const conversion = buildInvoiceFromQuote(quote, items, input.invoiceNumber, input.dueAt);
  if (conversion.alreadyConverted) return conversion;
  const invoiceId = await createInvoice({ userId: input.userId, ...conversion.input });
  await db.update(quotes).set({ status: "converted", convertedInvoiceId: invoiceId }).where(and(eq(quotes.id, quote.id), eq(quotes.userId, input.userId)));
  return { invoiceId, alreadyConverted: false };
}
async function listInvoices(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.issueAt));
  return rows.map((invoice) => ({ ...invoice, displayStatus: effectiveInvoiceStatus(invoice.status, invoice.dueAt) }));
}
async function getInvoice(userId, invoiceId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const invoice = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId))).limit(1);
  if (!invoice[0]) return void 0;
  const [items, customer] = await Promise.all([
    db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId)),
    db.select().from(contacts).where(and(eq(contacts.id, invoice[0].customerId), eq(contacts.userId, userId))).limit(1)
  ]);
  return { ...invoice[0], displayStatus: effectiveInvoiceStatus(invoice[0].status, invoice[0].dueAt), items, customer: customer[0] };
}
async function getPublicInvoice(publicToken) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const invoice = await db.select().from(invoices).where(eq(invoices.publicToken, publicToken)).limit(1);
  if (!invoice[0] || invoice[0].status === "draft") return void 0;
  const [items, customer] = await Promise.all([
    db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice[0].id)),
    db.select().from(contacts).where(eq(contacts.id, invoice[0].customerId)).limit(1)
  ]);
  return { ...invoice[0], displayStatus: effectiveInvoiceStatus(invoice[0].status, invoice[0].dueAt), items, customer: customer[0] };
}
async function sendInvoice(userId, invoiceId) {
  await ensureLedgerSetup(userId);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const invoice = await getInvoice(userId, invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "draft") throw new Error("Only draft invoices can be sent.");
  const rows = await listAccounts(userId);
  const receivable = rows.find((account) => account.code === "1100");
  const revenue = rows.find((account) => account.code === "4000");
  if (!receivable || !revenue) throw new Error("Required system accounts are unavailable.");
  const journalEntryId = await insertBalancedJournalEntry({ userId, postedAt: invoice.issueAt, memo: `Invoice ${invoice.number}`, sourceType: "invoice", sourceId: invoice.id, lines: [
    { accountId: receivable.id, debitCents: invoice.totalCents, creditCents: 0, description: "Accounts receivable" },
    { accountId: revenue.id, debitCents: 0, creditCents: invoice.totalCents, description: "Sales revenue" }
  ] });
  await db.update(invoices).set({ status: "sent", journalEntryId }).where(and(eq(invoices.id, invoice.id), eq(invoices.userId, userId)));
}
async function getFinancialSummary(userId, range) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const invoiceWhere = range ? and(eq(invoices.userId, userId), gte(invoices.issueAt, range.start), lte(invoices.issueAt, range.end)) : eq(invoices.userId, userId);
  if (range?.tagId) await assertOwnedTags(userId, [range.tagId]);
  const [invoiceRows, expenseRows] = await Promise.all([db.select().from(invoices).where(invoiceWhere), listExpenses(userId, range ? { start: range.start, end: range.end } : void 0)]);
  return summarizeFinancials(invoiceRows, filterTransactionsByTag(expenseRows, range?.tagId));
}
function calculateProfitAndLossFromRecords(summary, expenseRows, accountRows, range) {
  const accountsById = new Map(accountRows.map((account) => [account.id, account]));
  const selectedExpenses = filterTransactionsByTag(filterTransactionsByDate(expenseRows, range.start, range.end, "incurredAt"), range.tagId);
  const profitLossExpenses = selectedExpenses.map((expense) => {
    const account = accountsById.get(expense.expenseAccountId);
    return { accountId: expense.expenseAccountId, accountCode: account?.code ?? "UNASSIGNED", accountName: account?.name ?? "Uncategorized expense", amountCents: expense.amountCents };
  });
  return calculateProfitAndLoss(summary.revenueCents, profitLossExpenses);
}
async function getProfitAndLoss(userId, range) {
  const [summary, expenseRows, accountRows] = await Promise.all([
    getFinancialSummary(userId, range),
    listExpenses(userId, { start: range.start, end: range.end }),
    listAccounts(userId)
  ]);
  return calculateProfitAndLossFromRecords(summary, expenseRows, accountRows, range);
}
async function getTagSummary(userId, range) {
  const [tagRows, expenseRows, entryRows] = await Promise.all([
    listTags(userId),
    listExpenses(userId, range),
    listJournalEntries(userId)
  ]);
  const withinRangeEntries = range ? entryRows.filter((entry) => entry.postedAt >= range.start && entry.postedAt <= range.end) : entryRows;
  if (range?.tagId) await assertOwnedTags(userId, [range.tagId]);
  return buildTagSummary(tagRows, expenseRows, withinRangeEntries, range?.tagId);
}
async function setInvoiceCheckoutSession(userId, invoiceId, sessionId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(invoices).set({ stripeCheckoutSessionId: sessionId }).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
}
async function markInvoicePaidByStripe(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const found = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  const invoice = found[0];
  if (!invoice) throw new Error("Stripe payment referenced an unknown invoice.");
  if (invoice.status === "paid") return { alreadyPaid: true, invoiceId: invoice.id };
  if (invoice.status === "draft") throw new Error("A draft invoice cannot be settled.");
  const accountRows = await listAccounts(invoice.userId);
  const cash = accountRows.find((account) => account.code === "1000");
  const receivable = accountRows.find((account) => account.code === "1100");
  if (!cash || !receivable) throw new Error("Required payment accounts are unavailable.");
  const journalEntryId = await insertBalancedJournalEntry({
    userId: invoice.userId,
    postedAt: /* @__PURE__ */ new Date(),
    memo: `Payment received for invoice ${invoice.number}`,
    sourceType: "payment",
    sourceId: invoice.id,
    lines: [
      { accountId: cash.id, debitCents: invoice.totalCents, creditCents: 0, description: "Cash received" },
      { accountId: receivable.id, debitCents: 0, creditCents: invoice.totalCents, description: "Accounts receivable settled" }
    ]
  });
  await db.update(invoices).set({
    status: "paid",
    paidAt: /* @__PURE__ */ new Date(),
    journalEntryId,
    stripeCheckoutSessionId: input.checkoutSessionId ?? invoice.stripeCheckoutSessionId,
    stripePaymentIntentId: input.paymentIntentId ?? invoice.stripePaymentIntentId
  }).where(eq(invoices.id, invoice.id));
  return { alreadyPaid: false, invoiceId: invoice.id };
}
async function getAssistantContext(userId) {
  const [summary, invoiceRows, expenseRows, accountRows] = await Promise.all([
    getFinancialSummary(userId),
    listInvoices(userId),
    listExpenses(userId),
    listAccounts(userId)
  ]);
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    summary,
    invoices: invoiceRows.slice(0, 30).map((invoice) => ({ number: invoice.number, status: invoice.displayStatus, issueAt: invoice.issueAt, dueAt: invoice.dueAt, totalCents: invoice.totalCents })),
    expenses: expenseRows.slice(0, 50).map((expense) => ({ incurredAt: expense.incurredAt, amountCents: expense.amountCents, notes: expense.notes })),
    accounts: accountRows.map((account) => ({ id: account.id, code: account.code, name: account.name, type: account.type }))
  };
}
async function getSummarySettings(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select().from(summarySettings).where(eq(summarySettings.userId, userId)).limit(1);
  return rows[0];
}
async function saveSummarySettings(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(summarySettings).values(input).onDuplicateKeyUpdate({
    set: {
      recipientEmail: input.recipientEmail,
      cadence: input.cadence,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      timezone: input.timezone,
      enabled: input.enabled
    }
  });
}
async function setSummaryScheduleTask(settingsId, taskUid) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(summarySettings).set({ scheduleCronTaskUid: taskUid }).where(eq(summarySettings.id, settingsId));
}
async function getSummarySettingsByTaskUid(taskUid) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select().from(summarySettings).where(eq(summarySettings.scheduleCronTaskUid, taskUid)).limit(1);
  return rows[0];
}
async function recordSummaryDelivery(input) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.insert(summaryDeliveries).values(input);
}
async function hasSummaryDelivery(settingsId, periodStart, periodEnd) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const rows = await db.select({ id: summaryDeliveries.id }).from(summaryDeliveries).where(and(
    eq(summaryDeliveries.settingsId, settingsId),
    eq(summaryDeliveries.periodStart, periodStart),
    eq(summaryDeliveries.periodEnd, periodEnd),
    eq(summaryDeliveries.deliveryStatus, "sent")
  )).limit(1);
  return Boolean(rows[0]);
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/accounting.ts
import { z as z2 } from "zod";
var nullableText = z2.string().trim().max(5e3).optional().nullable();
var id = z2.number().int().positive();
var contactInput = z2.object({
  kind: z2.enum(["customer", "vendor"]),
  name: z2.string().trim().min(1).max(180),
  email: z2.string().email().max(320).optional().nullable(),
  phone: z2.string().trim().max(48).optional().nullable(),
  address: nullableText,
  notes: nullableText
});
var accountingRouter = router({
  contacts: router({
    list: protectedProcedure.input(z2.object({ kind: z2.enum(["customer", "vendor"]).optional() })).query(async ({ ctx, input }) => {
      return listContacts(ctx.user.id, input.kind);
    }),
    create: protectedProcedure.input(contactInput).mutation(async ({ ctx, input }) => {
      await createContact({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
    update: protectedProcedure.input(contactInput.omit({ kind: true }).extend({ id })).mutation(async ({ ctx, input }) => {
      const { id: contactId, ...data } = input;
      await updateContact(ctx.user.id, contactId, data);
      return { success: true };
    })
  }),
  accounts: router({
    list: protectedProcedure.query(({ ctx }) => listAccountsWithBalances(ctx.user.id)),
    create: protectedProcedure.input(z2.object({
      code: z2.string().trim().min(1).max(24),
      name: z2.string().trim().min(1).max(120),
      type: z2.enum(["asset", "liability", "equity", "income", "expense"]),
      description: nullableText
    })).mutation(async ({ ctx, input }) => {
      await createAccount({ userId: ctx.user.id, ...input });
      return { success: true };
    })
  }),
  tags: router({
    list: protectedProcedure.query(({ ctx }) => listTags(ctx.user.id)),
    create: protectedProcedure.input(z2.object({ name: z2.string().trim().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      await createTag(ctx.user.id, input.name);
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id })).mutation(async ({ ctx, input }) => {
      await deleteTag(ctx.user.id, input.id);
      return { success: true };
    })
  }),
  ledger: router({
    list: protectedProcedure.query(({ ctx }) => listJournalEntries(ctx.user.id)),
    create: protectedProcedure.input(z2.object({
      postedAt: z2.date(),
      memo: z2.string().trim().max(280).optional().nullable(),
      tagIds: z2.array(id).max(12).optional(),
      lines: z2.array(z2.object({
        accountId: id,
        debitCents: z2.number().int().min(0),
        creditCents: z2.number().int().min(0),
        description: z2.string().trim().max(280).optional().nullable()
      })).min(2)
    })).mutation(async ({ ctx, input }) => {
      const journalEntryId = await createManualJournalEntry({ userId: ctx.user.id, ...input });
      return { success: true, journalEntryId };
    })
  }),
  expenses: router({
    list: protectedProcedure.input(z2.object({ start: z2.date().optional(), end: z2.date().optional() }).optional()).query(({ ctx, input }) => {
      return listExpenses(ctx.user.id, input?.start && input.end ? { start: input.start, end: input.end } : void 0);
    }),
    create: protectedProcedure.input(z2.object({
      vendorId: id.optional().nullable(),
      expenseAccountId: id,
      paymentAccountId: id,
      amountCents: z2.number().int().positive(),
      incurredAt: z2.date(),
      notes: nullableText,
      tagIds: z2.array(id).max(12).optional()
    })).mutation(async ({ ctx, input }) => {
      await createExpense({ userId: ctx.user.id, ...input });
      return { success: true };
    })
  }),
  invoices: router({
    list: protectedProcedure.query(({ ctx }) => listInvoices(ctx.user.id)),
    get: protectedProcedure.input(z2.object({ id })).query(({ ctx, input }) => getInvoice(ctx.user.id, input.id)),
    getPublic: publicProcedure.input(z2.object({ publicToken: z2.string().min(16).max(32) })).query(({ input }) => getPublicInvoice(input.publicToken)),
    create: protectedProcedure.input(z2.object({
      customerId: id,
      number: z2.string().trim().min(1).max(48),
      issueAt: z2.date(),
      dueAt: z2.date(),
      notes: nullableText,
      taxCents: z2.number().int().min(0).optional(),
      items: z2.array(z2.object({
        description: z2.string().trim().min(1).max(280),
        quantity: z2.number().int().positive(),
        unitAmountCents: z2.number().int().min(0)
      })).min(1)
    })).mutation(async ({ ctx, input }) => {
      const invoiceId = await createInvoice({ userId: ctx.user.id, ...input });
      return { success: true, invoiceId };
    }),
    send: protectedProcedure.input(z2.object({ id })).mutation(async ({ ctx, input }) => {
      await sendInvoice(ctx.user.id, input.id);
      return { success: true };
    })
  }),
  dashboard: router({
    overview: protectedProcedure.query(({ ctx }) => getFinancialSummary(ctx.user.id))
  }),
  reports: router({
    financialSummary: protectedProcedure.input(z2.object({ start: z2.date(), end: z2.date(), tagId: id.optional() })).query(({ ctx, input }) => {
      return getFinancialSummary(ctx.user.id, input);
    }),
    profitAndLoss: protectedProcedure.input(z2.object({ start: z2.date(), end: z2.date(), tagId: id.optional() })).query(({ ctx, input }) => {
      return getProfitAndLoss(ctx.user.id, input);
    }),
    tagSummary: protectedProcedure.input(z2.object({ start: z2.date().optional(), end: z2.date().optional(), tagId: id.optional() }).optional()).query(({ ctx, input }) => {
      return getTagSummary(ctx.user.id, input?.start && input.end ? { start: input.start, end: input.end, tagId: input.tagId } : input?.tagId ? { start: /* @__PURE__ */ new Date(0), end: /* @__PURE__ */ new Date(), tagId: input.tagId } : void 0);
    })
  })
});

// server/routers/insights.ts
import { z as z3 } from "zod";

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
async function listLLMModels() {
  assertApiKey();
  const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models` : "https://forge.manus.im/v1/models";
  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.forgeApiKey}` }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/routers/insights.ts
async function chooseFinanceModel() {
  const { data } = await listLLMModels();
  return data.find((model) => model.id === "gpt-5-mini")?.id ?? data[0]?.id;
}
var guidance = `You are the LedgerWise finance assistant. Answer only from the supplied authenticated business data. Never invent money amounts, invoices, dates, account balances, vendors, trends, or facts. If the data cannot answer the question, say exactly what information is missing. State money amounts in USD based on cents from the data. Do not present tax, legal, audit, investment, or regulatory advice as professional advice. Keep answers concise and explain the relevant data basis.`;
var insightsRouter = router({
  ask: protectedProcedure.input(z3.object({ question: z3.string().trim().min(1).max(1200) })).mutation(async ({ ctx, input }) => {
    const context = await getAssistantContext(ctx.user.id);
    const model = await chooseFinanceModel();
    const response = await invokeLLM({
      model,
      messages: [
        { role: "system", content: guidance },
        { role: "user", content: `Authenticated financial data:
${JSON.stringify(context)}

Question: ${input.question}` }
      ],
      maxTokens: 700
    });
    const rawContent = response.choices[0]?.message.content;
    return { answer: typeof rawContent === "string" ? rawContent : "I could not generate an answer from the current records." };
  }),
  categorizeExpense: protectedProcedure.input(z3.object({ description: z3.string().trim().min(2).max(280), amountCents: z3.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const context = await getAssistantContext(ctx.user.id);
    const model = await chooseFinanceModel();
    const response = await invokeLLM({
      model,
      messages: [
        { role: "system", content: `${guidance} Categorize an expense using only the supplied chart of accounts. If no account is a credible match, return accountId null.` },
        { role: "user", content: `Chart of accounts: ${JSON.stringify(context.accounts)}
Expense description: ${input.description}
Amount cents: ${input.amountCents}` }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "expense_category",
          strict: true,
          schema: {
            type: "object",
            properties: { accountId: { type: ["integer", "null"] }, rationale: { type: "string" } },
            required: ["accountId", "rationale"],
            additionalProperties: false
          }
        }
      },
      maxTokens: 250
    });
    const rawContent = response.choices[0]?.message.content;
    const content = typeof rawContent === "string" ? rawContent : "";
    if (!content) throw new Error("The expense categorizer did not return a result.");
    return JSON.parse(content);
  })
});

// server/routers/payments.ts
import { z as z4 } from "zod";

// server/stripe.ts
import Stripe from "stripe";
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured. Add a Stripe key in the project payment settings.");
  return new Stripe(key);
}
function paymentReferenceFromEvent(event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return null;
    const invoiceId = Number(session.metadata?.invoiceId);
    return Number.isInteger(invoiceId) && invoiceId > 0 ? { invoiceId, checkoutSessionId: session.id, paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : void 0 } : null;
  }
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const invoiceId = Number(intent.metadata?.invoiceId);
    return Number.isInteger(invoiceId) && invoiceId > 0 ? { invoiceId, paymentIntentId: intent.id } : null;
  }
  return null;
}
async function processStripePaymentEvent(event, settleInvoice = markInvoicePaidByStripe) {
  const reference = paymentReferenceFromEvent(event);
  if (!reference) return { processed: false };
  await settleInvoice(reference);
  return { processed: true, reference };
}
async function createInvoiceCheckout(input) {
  const invoice = await getInvoice(input.userId, input.invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "sent" && invoice.status !== "overdue") throw new Error("Send the invoice before creating a payment link.");
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.customer?.email ?? void 0,
    client_reference_id: String(input.userId),
    success_url: `${input.origin}/invoices/${invoice.id}/print?payment=success`,
    cancel_url: `${input.origin}/invoices/${invoice.id}/print?payment=cancelled`,
    metadata: { invoiceId: String(invoice.id), userId: String(input.userId), invoiceNumber: invoice.number },
    payment_intent_data: { metadata: { invoiceId: String(invoice.id), userId: String(input.userId) } },
    allow_promotion_codes: true,
    line_items: invoice.items.map((item) => ({
      quantity: item.quantity,
      price_data: { currency: "usd", unit_amount: item.unitAmountCents, product_data: { name: item.description } }
    }))
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  await setInvoiceCheckoutSession(input.userId, invoice.id, session.id);
  return { url: session.url };
}
async function stripeWebhookHandler(req, res) {
  try {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") return res.status(400).json({ error: "Missing Stripe signature." });
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(500).json({ error: "Stripe webhook secret is not configured." });
    const event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
    if (event.id.startsWith("evt_test_")) return res.json({ verified: true });
    await processStripePaymentEvent(event);
    return res.json({ received: true });
  } catch (error) {
    console.error("[Stripe webhook]", error);
    return res.status(400).json({ error: "Webhook signature or payment processing failed." });
  }
}

// server/routers/payments.ts
var paymentsRouter = router({
  createInvoiceCheckout: protectedProcedure.input(z4.object({ invoiceId: z4.number().int().positive() })).mutation(({ ctx, input }) => {
    const originHeader = ctx.req.headers.origin;
    const origin = typeof originHeader === "string" ? originHeader : "";
    if (!origin.startsWith("http")) throw new Error("A trusted site origin is required to create a checkout link.");
    return createInvoiceCheckout({ userId: ctx.user.id, invoiceId: input.invoiceId, origin });
  }),
  createPublicInvoiceCheckout: publicProcedure.input(z4.object({ publicToken: z4.string().min(16).max(32), origin: z4.string().url() })).mutation(async ({ input }) => {
    const invoice = await getPublicInvoice(input.publicToken);
    if (!invoice) throw new Error("Invoice not found.");
    return createInvoiceCheckout({ userId: invoice.userId, invoiceId: invoice.id, origin: input.origin });
  })
});

// server/routers/quotes.ts
import { z as z5 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";
var id2 = z5.number().int().positive();
var quoteItem = z5.object({ serviceCatalogId: id2.optional().nullable(), description: z5.string().trim().min(1).max(280), category: z5.string().trim().max(96).optional().nullable(), quantity: z5.number().int().positive(), unitAmountCents: z5.number().int().nonnegative(), billingFrequency: z5.enum(["one_time", "monthly"]) });
var quotesRouter = router({
  services: router({
    list: protectedProcedure.query(({ ctx }) => listServices(ctx.user.id)),
    create: protectedProcedure.input(z5.object({ name: z5.string().trim().min(1).max(180), category: z5.string().trim().min(1).max(96), description: z5.string().trim().max(1e3).optional().nullable(), defaultUnitAmountCents: z5.number().int().nonnegative(), billingFrequency: z5.enum(["one_time", "monthly"]) })).mutation(async ({ ctx, input }) => {
      await createService({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
    archive: protectedProcedure.input(z5.object({ id: id2 })).mutation(async ({ ctx, input }) => {
      await archiveService(ctx.user.id, input.id);
      return { success: true };
    })
  }),
  quotes: router({
    list: protectedProcedure.query(({ ctx }) => listQuotes(ctx.user.id)),
    get: protectedProcedure.input(z5.object({ id: id2 })).query(async ({ ctx, input }) => {
      const quote = await getQuote(ctx.user.id, input.id);
      if (!quote) throw new TRPCError3({ code: "NOT_FOUND", message: "Quote not found in this workspace." });
      return quote;
    }),
    create: protectedProcedure.input(z5.object({ customerId: id2, number: z5.string().trim().min(1).max(48), title: z5.string().trim().min(1).max(180), issueAt: z5.date(), validUntil: z5.date().optional().nullable(), notes: z5.string().trim().max(3e3).optional().nullable(), items: z5.array(quoteItem).min(1).max(50) })).mutation(async ({ ctx, input }) => ({ quoteId: await createQuote({ userId: ctx.user.id, ...input }) })),
    delete: protectedProcedure.input(z5.object({ id: id2 })).mutation(async ({ ctx, input }) => {
      await deleteQuote(ctx.user.id, input.id);
      return { success: true };
    }),
    convertToInvoice: protectedProcedure.input(z5.object({ quoteId: id2, invoiceNumber: z5.string().trim().min(1).max(48), dueAt: z5.date() })).mutation(({ ctx, input }) => convertQuoteToInvoice({ userId: ctx.user.id, ...input }))
  })
});

// server/routers/settings.ts
import { z as z6 } from "zod";

// server/summaryScheduler.ts
import { parse as parseCookie } from "cookie";

// server/_core/heartbeat.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
var SERVICE = "webdevtoken.v1.WebDevService";
var buildEndpoint = (rpc) => {
  if (!ENV.forgeApiUrl) {
    throw new TRPCError4({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service URL is not configured (BUILT_IN_FORGE_API_URL)."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError4({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service API key is not configured (BUILT_IN_FORGE_API_KEY)."
    });
  }
  const baseUrl = ENV.forgeApiUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`${SERVICE}/${rpc}`, normalizedBase).toString();
};
var callForge = async (rpc, body, userSession) => {
  const endpoint = buildEndpoint(rpc);
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${ENV.forgeApiKey}`,
    "content-type": "application/json",
    "connect-protocol-version": "1"
  };
  if (userSession) {
    headers["x-manus-user-session"] = userSession;
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new TRPCError4({
      code: "INTERNAL_SERVER_ERROR",
      message: `Heartbeat ${rpc} network error: ${String(error)}`
    });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw mapForgeError(response, detail, rpc);
  }
  return await response.json();
};
var mapForgeError = (response, detail, rpc) => {
  const status = response.status;
  let code = "INTERNAL_SERVER_ERROR";
  if (status === 401) code = "UNAUTHORIZED";
  else if (status === 403) code = "FORBIDDEN";
  else if (status === 404) code = "NOT_FOUND";
  else if (status === 400 || status === 422) code = "BAD_REQUEST";
  else if (status === 409) code = "CONFLICT";
  else if (status === 429) code = "TOO_MANY_REQUESTS";
  return new TRPCError4({
    code,
    message: `Heartbeat ${rpc} failed (${status})${detail ? `: ${detail}` : ""}`
  });
};
var stringifyPayload = (payload) => {
  if (payload === void 0 || payload === null) return "{}";
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
};
var validateCallbackPath = (path) => {
  if (!path || !path.startsWith("/api/scheduled/")) {
    throw new TRPCError4({
      code: "BAD_REQUEST",
      message: "callback path must start with /api/scheduled/"
    });
  }
};
async function createHeartbeatJob(job, userSession) {
  validateCallbackPath(job.path);
  return callForge(
    "CreateHeartbeatJob",
    {
      name: job.name,
      cronExpression: job.cron,
      callbackPath: job.path,
      callbackMethod: job.method ?? "POST",
      callbackPayload: stringifyPayload(job.payload),
      description: job.description ?? ""
    },
    userSession
  );
}
async function updateHeartbeatJob(taskUid, patch, userSession) {
  if (patch.path !== void 0) validateCallbackPath(patch.path);
  const body = { taskUid };
  if (patch.cron !== void 0) body.cronExpression = patch.cron;
  if (patch.path !== void 0) body.callbackPath = patch.path;
  if (patch.method !== void 0) body.callbackMethod = patch.method;
  if (patch.payload !== void 0) {
    body.callbackPayload = stringifyPayload(patch.payload);
  }
  if (patch.description !== void 0) body.description = patch.description;
  if (patch.enable !== void 0) body.enable = patch.enable;
  return callForge(
    "UpdateHeartbeatJob",
    body,
    userSession
  );
}

// server/summaryEmail.ts
function hasEmailConfiguration(config) {
  return Boolean(config.apiKey?.trim() && config.fromEmail?.trim());
}
var money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
function buildFinancialSummaryEmail(summary) {
  const rows = [
    ["Revenue", money(summary.revenueCents)],
    ["Expenses", money(summary.expensesCents)],
    ["Net profit", money(summary.netProfitCents)],
    ["Outstanding invoices", money(summary.outstandingCents)]
  ].map(([label, value]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #ddd">${label}</td><td style="padding:12px 0;border-bottom:1px solid #ddd;text-align:right;font-weight:700">${value}</td></tr>`).join("");
  return {
    subject: `LedgerWise financial summary \u2014 ${summary.periodLabel}`,
    html: `<main style="max-width:620px;margin:0 auto;padding:32px;font-family:Arial,sans-serif;color:#171717"><p style="font-size:11px;font-weight:700;letter-spacing:1.4px">LEDGERWISE / FINANCIAL SUMMARY</p><h1 style="font-size:34px;line-height:1;margin:20px 0 28px">Your business at a glance.</h1><p style="color:#555">${summary.periodLabel}</p><table style="width:100%;border-collapse:collapse;margin-top:24px">${rows}</table><p style="margin-top:32px;color:#666;font-size:13px;line-height:1.6">This summary is based on the invoices and expenses recorded in your LedgerWise workspace during the selected period.</p></main>`
  };
}
async function sendFinancialSummaryEmail(summary) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!hasEmailConfiguration({ apiKey, fromEmail })) throw new Error("Dedicated email delivery is not configured.");
  const content = buildFinancialSummaryEmail(summary);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to: [summary.recipientEmail], subject: content.subject, html: content.html })
  });
  if (!response.ok) throw new Error(`Email provider rejected the summary (${response.status}).`);
  const result = await response.json();
  return result.id ?? null;
}

// server/summaryScheduler.ts
function summaryCron(cadence, dayOfWeek = 1, dayOfMonth = 1) {
  return cadence === "weekly" ? `0 0 13 * * ${dayOfWeek}` : `0 0 13 ${dayOfMonth} * *`;
}
async function configureSummarySchedule(input) {
  const cron = summaryCron(input.cadence, input.dayOfWeek, input.dayOfMonth);
  if (input.scheduleCronTaskUid) {
    await updateHeartbeatJob(input.scheduleCronTaskUid, { cron, enable: true, description: "LedgerWise financial summary email" }, input.userSession);
    return input.scheduleCronTaskUid;
  }
  const job = await createHeartbeatJob({
    name: `ledgerwise-summary-${input.settingsId}`,
    cron,
    path: "/api/scheduled/financial-summary",
    description: "LedgerWise financial summary email"
  }, input.userSession);
  await setSummaryScheduleTask(input.settingsId, job.taskUid);
  return job.taskUid;
}
async function financialSummaryHandler(req, res) {
  let taskUid;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });
    const settings = await getSummarySettingsByTaskUid(taskUid);
    if (!settings || settings.enabled !== "yes") return res.json({ ok: true, skipped: "inactive-or-orphan" });
    const now = /* @__PURE__ */ new Date();
    const periodEnd = settings.cadence === "weekly" ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodStart = new Date(periodEnd);
    if (settings.cadence === "weekly") periodStart.setUTCDate(periodStart.getUTCDate() - 7);
    else periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
    if (await hasSummaryDelivery(settings.id, periodStart, periodEnd)) return res.json({ ok: true, skipped: "already-delivered" });
    const summary = await getFinancialSummary(settings.userId, { start: periodStart, end: periodEnd });
    const providerMessageId = await sendFinancialSummaryEmail({
      recipientEmail: settings.recipientEmail,
      periodLabel: `${periodStart.toLocaleDateString()} \u2013 ${periodEnd.toLocaleDateString()}`,
      ...summary
    });
    await recordSummaryDelivery({ settingsId: settings.id, periodStart, periodEnd, deliveryStatus: "sent", providerMessageId });
    return res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Financial summary]", message);
    return res.status(500).json({ error: message, context: { taskUid }, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
}
function sessionTokenFromRequest(req) {
  return parseCookie(req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
}

// server/routers/settings.ts
var settingsRouter = router({
  summary: router({
    get: protectedProcedure.query(({ ctx }) => getSummarySettings(ctx.user.id)),
    save: protectedProcedure.input(z6.object({
      recipientEmail: z6.string().email(),
      cadence: z6.enum(["weekly", "monthly"]),
      dayOfWeek: z6.number().int().min(0).max(6),
      dayOfMonth: z6.number().int().min(1).max(28),
      timezone: z6.string().trim().min(1).max(64),
      enabled: z6.enum(["yes", "no"])
    })).mutation(async ({ ctx, input }) => {
      if (input.enabled === "yes" && !process.env.RESEND_API_KEY) {
        throw new Error("Add the dedicated email provider credentials before enabling scheduled delivery.");
      }
      await saveSummarySettings({ userId: ctx.user.id, ...input });
      const settings = await getSummarySettings(ctx.user.id);
      if (!settings) throw new Error("Summary settings could not be saved.");
      if (input.enabled === "yes") {
        const taskUid = await configureSummarySchedule({
          settingsId: settings.id,
          scheduleCronTaskUid: settings.scheduleCronTaskUid,
          cadence: input.cadence,
          dayOfWeek: input.dayOfWeek,
          dayOfMonth: input.dayOfMonth,
          userSession: sessionTokenFromRequest(ctx.req)
        });
        return { success: true, taskUid };
      }
      return { success: true, taskUid: settings.scheduleCronTaskUid ?? null };
    })
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  accounting: accountingRouter,
  insights: insightsRouter,
  payments: paymentsRouter,
  quotes: quotesRouter,
  settings: settingsRouter
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/app.ts
function createApp() {
  const app = express();
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
  app.post("/api/scheduled/financial-summary", financialSummaryHandler);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app;
}

// server/vercelHandler.ts
var vercelHandler_default = createApp();
export {
  vercelHandler_default as default
};
