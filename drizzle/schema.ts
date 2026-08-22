import { index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * `authUserId` is the Supabase Auth user UUID (auth.users.id) — the single
 * source of truth for identity. Extend this file with additional tables as
 * your product grows. Columns use camelCase to match generated types.
 */
export const userRoleEnum = pgEnum("ledge_user_role", ["user", "admin"]);

export const users = pgTable("ledge_users", {
  id: serial("id").primaryKey(),
  /** Supabase Auth user id (auth.users.id, uuid). Unique per user. */
  authUserId: varchar("authUserId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const contactKindEnum = pgEnum("ledge_contact_kind", ["customer", "vendor"]);

export const contacts = pgTable("ledge_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  kind: contactKindEnum("kind").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 48 }),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [index("ledge_contacts_user_kind_idx").on(table.userId, table.kind)]);

export const accountTypeEnum = pgEnum("ledge_account_type", ["asset", "liability", "equity", "income", "expense"]);
export const yesNoEnum = pgEnum("ledge_yes_no", ["yes", "no"]);

export const accounts = pgTable("ledge_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  code: varchar("code", { length: 24 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: accountTypeEnum("type").notNull(),
  description: text("description"),
  isSystem: yesNoEnum("isSystem").default("no").notNull(),
  isActive: yesNoEnum("isActive").default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("accounts_user_code_unique").on(table.userId, table.code),
  index("ledge_accounts_user_type_idx").on(table.userId, table.type),
]);

export const journalSourceTypeEnum = pgEnum("ledge_journal_source_type", ["manual", "invoice", "expense", "payment"]);

export const journalEntries = pgTable("ledge_journalEntries", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  postedAt: timestamp("postedAt").notNull(),
  memo: varchar("memo", { length: 280 }),
  sourceType: journalSourceTypeEnum("sourceType").default("manual").notNull(),
  sourceId: integer("sourceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("ledge_journal_entries_user_date_idx").on(table.userId, table.postedAt)]);

export const journalLines = pgTable("ledge_journalLines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journalEntryId").notNull(),
  accountId: integer("accountId").notNull(),
  debitCents: integer("debitCents").default(0).notNull(),
  creditCents: integer("creditCents").default(0).notNull(),
  description: varchar("description", { length: 280 }),
}, table => [
  index("ledge_journal_lines_entry_idx").on(table.journalEntryId),
  index("ledge_journal_lines_account_idx").on(table.accountId),
]);

export const invoiceStatusEnum = pgEnum("ledge_invoice_status", ["draft", "sent", "paid", "overdue"]);

export const invoices = pgTable("ledge_invoices", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  customerId: integer("customerId").notNull(),
  number: varchar("number", { length: 48 }).notNull(),
  publicToken: varchar("publicToken", { length: 32 }).notNull(),
  status: invoiceStatusEnum("status").default("draft").notNull(),
  issueAt: timestamp("issueAt").notNull(),
  dueAt: timestamp("dueAt").notNull(),
  subtotalCents: integer("subtotalCents").default(0).notNull(),
  taxCents: integer("taxCents").default(0).notNull(),
  totalCents: integer("totalCents").default(0).notNull(),
  notes: text("notes"),
  journalEntryId: integer("journalEntryId"),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 255 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("invoices_user_number_unique").on(table.userId, table.number),
  uniqueIndex("invoices_public_token_unique").on(table.publicToken),
  index("ledge_invoices_user_status_idx").on(table.userId, table.status),
  index("ledge_invoices_customer_idx").on(table.customerId),
]);

export const invoiceLineItems = pgTable("ledge_invoiceLineItems", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoiceId").notNull(),
  description: varchar("description", { length: 280 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitAmountCents: integer("unitAmountCents").notNull(),
  lineTotalCents: integer("lineTotalCents").notNull(),
}, table => [index("ledge_invoice_items_invoice_idx").on(table.invoiceId)]);

export const billingFrequencyEnum = pgEnum("ledge_billing_frequency", ["one_time", "monthly"]);

export const serviceCatalog = pgTable("ledge_serviceCatalog", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  category: varchar("category", { length: 96 }).notNull(),
  description: text("description"),
  defaultUnitAmountCents: integer("defaultUnitAmountCents").notNull(),
  billingFrequency: billingFrequencyEnum("billingFrequency").default("one_time").notNull(),
  isActive: yesNoEnum("isActive").default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [
  index("ledge_services_user_category_idx").on(table.userId, table.category),
  index("ledge_services_user_active_idx").on(table.userId, table.isActive),
]);

export const quoteStatusEnum = pgEnum("ledge_quote_status", ["draft", "sent", "accepted", "declined", "converted"]);

export const quotes = pgTable("ledge_quotes", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  customerId: integer("customerId").notNull(),
  number: varchar("number", { length: 48 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  status: quoteStatusEnum("status").default("draft").notNull(),
  issueAt: timestamp("issueAt").notNull(),
  validUntil: timestamp("validUntil"),
  notes: text("notes"),
  oneTimeCents: integer("oneTimeCents").default(0).notNull(),
  monthlyCents: integer("monthlyCents").default(0).notNull(),
  convertedInvoiceId: integer("convertedInvoiceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("quotes_user_number_unique").on(table.userId, table.number),
  index("ledge_quotes_user_status_idx").on(table.userId, table.status),
  index("ledge_quotes_customer_idx").on(table.customerId),
]);

export const quoteLineItems = pgTable("ledge_quoteLineItems", {
  id: serial("id").primaryKey(),
  quoteId: integer("quoteId").notNull(),
  serviceCatalogId: integer("serviceCatalogId"),
  description: varchar("description", { length: 280 }).notNull(),
  category: varchar("category", { length: 96 }),
  quantity: integer("quantity").notNull(),
  unitAmountCents: integer("unitAmountCents").notNull(),
  lineTotalCents: integer("lineTotalCents").notNull(),
  billingFrequency: billingFrequencyEnum("billingFrequency").default("one_time").notNull(),
}, table => [
  index("ledge_quote_items_quote_idx").on(table.quoteId),
  index("ledge_quote_items_service_idx").on(table.serviceCatalogId),
]);

export const expenses = pgTable("ledge_expenses", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  vendorId: integer("vendorId"),
  expenseAccountId: integer("expenseAccountId").notNull(),
  paymentAccountId: integer("paymentAccountId").notNull(),
  amountCents: integer("amountCents").notNull(),
  incurredAt: timestamp("incurredAt").notNull(),
  notes: text("notes"),
  journalEntryId: integer("journalEntryId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, table => [index("ledge_expenses_user_date_idx").on(table.userId, table.incurredAt)]);

export const tags = pgTable("ledge_tags", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("tags_user_name_unique").on(table.userId, table.name),
  index("ledge_tags_user_idx").on(table.userId),
]);

export const expenseTags = pgTable("ledge_expenseTags", {
  id: serial("id").primaryKey(),
  expenseId: integer("expenseId").notNull(),
  tagId: integer("tagId").notNull(),
}, table => [
  uniqueIndex("expense_tags_unique").on(table.expenseId, table.tagId),
  index("ledge_expense_tags_tag_idx").on(table.tagId),
]);

export const journalEntryTags = pgTable("ledge_journalEntryTags", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journalEntryId").notNull(),
  tagId: integer("tagId").notNull(),
}, table => [
  uniqueIndex("journal_entry_tags_unique").on(table.journalEntryId, table.tagId),
  index("ledge_journal_entry_tags_tag_idx").on(table.tagId),
]);

export const summaryCadenceEnum = pgEnum("ledge_summary_cadence", ["weekly", "monthly"]);

/**
 * Vercel Cron hits one shared daily endpoint (see vercel.json), so there is
 * no per-user external task id to track anymore — the handler scans every
 * enabled row and decides which are due today. See server/summaryScheduler.ts.
 */
export const summarySettings = pgTable("ledge_summarySettings", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  cadence: summaryCadenceEnum("cadence").default("monthly").notNull(),
  dayOfWeek: integer("dayOfWeek").default(1).notNull(),
  dayOfMonth: integer("dayOfMonth").default(1).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
  enabled: yesNoEnum("enabled").default("no").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const summaryDeliveryStatusEnum = pgEnum("ledge_summary_delivery_status", ["sent", "failed"]);

export const summaryDeliveries = pgTable("ledge_summaryDeliveries", {
  id: serial("id").primaryKey(),
  settingsId: integer("settingsId").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  deliveryStatus: summaryDeliveryStatusEnum("deliveryStatus").notNull(),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  errorMessage: text("errorMessage"),
}, table => [index("ledge_summary_deliveries_settings_idx").on(table.settingsId, table.sentAt)]);

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";
