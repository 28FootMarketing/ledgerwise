import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("contactKind", ["customer", "vendor"]).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 48 }),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("contacts_user_kind_idx").on(table.userId, table.kind)]);

export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  code: varchar("code", { length: 24 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: mysqlEnum("accountType", ["asset", "liability", "equity", "income", "expense"]).notNull(),
  description: text("description"),
  isSystem: mysqlEnum("isSystem", ["yes", "no"]).default("no").notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("accounts_user_code_unique").on(table.userId, table.code),
  index("accounts_user_type_idx").on(table.userId, table.type),
]);

export const journalEntries = mysqlTable("journalEntries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  postedAt: timestamp("postedAt").notNull(),
  memo: varchar("memo", { length: 280 }),
  sourceType: mysqlEnum("journalSourceType", ["manual", "invoice", "expense", "payment"]).default("manual").notNull(),
  sourceId: int("sourceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("journal_entries_user_date_idx").on(table.userId, table.postedAt)]);

export const journalLines = mysqlTable("journalLines", {
  id: int("id").autoincrement().primaryKey(),
  journalEntryId: int("journalEntryId").notNull(),
  accountId: int("accountId").notNull(),
  debitCents: int("debitCents").default(0).notNull(),
  creditCents: int("creditCents").default(0).notNull(),
  description: varchar("description", { length: 280 }),
}, table => [
  index("journal_lines_entry_idx").on(table.journalEntryId),
  index("journal_lines_account_idx").on(table.accountId),
]);

export const invoices = mysqlTable("invoices", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("invoices_user_number_unique").on(table.userId, table.number),
  uniqueIndex("invoices_public_token_unique").on(table.publicToken),
  index("invoices_user_status_idx").on(table.userId, table.status),
  index("invoices_customer_idx").on(table.customerId),
]);

export const invoiceLineItems = mysqlTable("invoiceLineItems", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  description: varchar("description", { length: 280 }).notNull(),
  quantity: int("quantity").notNull(),
  unitAmountCents: int("unitAmountCents").notNull(),
  lineTotalCents: int("lineTotalCents").notNull(),
}, table => [index("invoice_items_invoice_idx").on(table.invoiceId)]);

export const serviceCatalog = mysqlTable("serviceCatalog", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  category: varchar("category", { length: 96 }).notNull(),
  description: text("description"),
  defaultUnitAmountCents: int("defaultUnitAmountCents").notNull(),
  billingFrequency: mysqlEnum("serviceBillingFrequency", ["one_time", "monthly"]).default("one_time").notNull(),
  isActive: mysqlEnum("serviceActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("services_user_category_idx").on(table.userId, table.category),
  index("services_user_active_idx").on(table.userId, table.isActive),
]);

export const quotes = mysqlTable("quotes", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("quotes_user_number_unique").on(table.userId, table.number),
  index("quotes_user_status_idx").on(table.userId, table.status),
  index("quotes_customer_idx").on(table.customerId),
]);

export const quoteLineItems = mysqlTable("quoteLineItems", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull(),
  serviceCatalogId: int("serviceCatalogId"),
  description: varchar("description", { length: 280 }).notNull(),
  category: varchar("category", { length: 96 }),
  quantity: int("quantity").notNull(),
  unitAmountCents: int("unitAmountCents").notNull(),
  lineTotalCents: int("lineTotalCents").notNull(),
  billingFrequency: mysqlEnum("quoteBillingFrequency", ["one_time", "monthly"]).default("one_time").notNull(),
}, table => [
  index("quote_items_quote_idx").on(table.quoteId),
  index("quote_items_service_idx").on(table.serviceCatalogId),
]);

export const expenses = mysqlTable("expenses", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("expenses_user_date_idx").on(table.userId, table.incurredAt)]);

export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("tags_user_name_unique").on(table.userId, table.name),
  index("tags_user_idx").on(table.userId),
]);

export const expenseTags = mysqlTable("expenseTags", {
  id: int("id").autoincrement().primaryKey(),
  expenseId: int("expenseId").notNull(),
  tagId: int("tagId").notNull(),
}, table => [
  uniqueIndex("expense_tags_unique").on(table.expenseId, table.tagId),
  index("expense_tags_tag_idx").on(table.tagId),
]);

export const journalEntryTags = mysqlTable("journalEntryTags", {
  id: int("id").autoincrement().primaryKey(),
  journalEntryId: int("journalEntryId").notNull(),
  tagId: int("tagId").notNull(),
}, table => [
  uniqueIndex("journal_entry_tags_unique").on(table.journalEntryId, table.tagId),
  index("journal_entry_tags_tag_idx").on(table.tagId),
]);

export const summarySettings = mysqlTable("summarySettings", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("summary_schedule_uid_idx").on(table.scheduleCronTaskUid)]);

export const summaryDeliveries = mysqlTable("summaryDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  settingsId: int("settingsId").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  deliveryStatus: mysqlEnum("summaryDeliveryStatus", ["sent", "failed"]).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  errorMessage: text("errorMessage"),
}, table => [index("summary_deliveries_settings_idx").on(table.settingsId, table.sentAt)]);

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";
