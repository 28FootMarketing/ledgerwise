CREATE TYPE "public"."ledge_account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."ledge_billing_frequency" AS ENUM('one_time', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."ledge_contact_kind" AS ENUM('customer', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."ledge_invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."ledge_journal_source_type" AS ENUM('manual', 'invoice', 'expense', 'payment');--> statement-breakpoint
CREATE TYPE "public"."ledge_quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'converted');--> statement-breakpoint
CREATE TYPE "public"."ledge_summary_cadence" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."ledge_summary_delivery_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ledge_user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."ledge_yes_no" AS ENUM('yes', 'no');--> statement-breakpoint
CREATE TABLE "ledge_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" "ledge_account_type" NOT NULL,
	"description" text,
	"isSystem" "ledge_yes_no" DEFAULT 'no' NOT NULL,
	"isActive" "ledge_yes_no" DEFAULT 'yes' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"kind" "ledge_contact_kind" NOT NULL,
	"name" varchar(180) NOT NULL,
	"email" varchar(320),
	"phone" varchar(48),
	"address" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_expenseTags" (
	"id" serial PRIMARY KEY NOT NULL,
	"expenseId" integer NOT NULL,
	"tagId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"vendorId" integer,
	"expenseAccountId" integer NOT NULL,
	"paymentAccountId" integer NOT NULL,
	"amountCents" integer NOT NULL,
	"incurredAt" timestamp NOT NULL,
	"notes" text,
	"journalEntryId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_invoiceLineItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoiceId" integer NOT NULL,
	"description" varchar(280) NOT NULL,
	"quantity" integer NOT NULL,
	"unitAmountCents" integer NOT NULL,
	"lineTotalCents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"customerId" integer NOT NULL,
	"number" varchar(48) NOT NULL,
	"publicToken" varchar(32) NOT NULL,
	"status" "ledge_invoice_status" DEFAULT 'draft' NOT NULL,
	"issueAt" timestamp NOT NULL,
	"dueAt" timestamp NOT NULL,
	"subtotalCents" integer DEFAULT 0 NOT NULL,
	"taxCents" integer DEFAULT 0 NOT NULL,
	"totalCents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"journalEntryId" integer,
	"stripeCheckoutSessionId" varchar(255),
	"stripePaymentIntentId" varchar(255),
	"paidAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_journalEntries" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"postedAt" timestamp NOT NULL,
	"memo" varchar(280),
	"sourceType" "ledge_journal_source_type" DEFAULT 'manual' NOT NULL,
	"sourceId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_journalEntryTags" (
	"id" serial PRIMARY KEY NOT NULL,
	"journalEntryId" integer NOT NULL,
	"tagId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_journalLines" (
	"id" serial PRIMARY KEY NOT NULL,
	"journalEntryId" integer NOT NULL,
	"accountId" integer NOT NULL,
	"debitCents" integer DEFAULT 0 NOT NULL,
	"creditCents" integer DEFAULT 0 NOT NULL,
	"description" varchar(280)
);
--> statement-breakpoint
CREATE TABLE "ledge_quoteLineItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"quoteId" integer NOT NULL,
	"serviceCatalogId" integer,
	"description" varchar(280) NOT NULL,
	"category" varchar(96),
	"quantity" integer NOT NULL,
	"unitAmountCents" integer NOT NULL,
	"lineTotalCents" integer NOT NULL,
	"billingFrequency" "ledge_billing_frequency" DEFAULT 'one_time' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"customerId" integer NOT NULL,
	"number" varchar(48) NOT NULL,
	"title" varchar(180) NOT NULL,
	"status" "ledge_quote_status" DEFAULT 'draft' NOT NULL,
	"issueAt" timestamp NOT NULL,
	"validUntil" timestamp,
	"notes" text,
	"oneTimeCents" integer DEFAULT 0 NOT NULL,
	"monthlyCents" integer DEFAULT 0 NOT NULL,
	"convertedInvoiceId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_serviceCatalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"category" varchar(96) NOT NULL,
	"description" text,
	"defaultUnitAmountCents" integer NOT NULL,
	"billingFrequency" "ledge_billing_frequency" DEFAULT 'one_time' NOT NULL,
	"isActive" "ledge_yes_no" DEFAULT 'yes' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_summaryDeliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"settingsId" integer NOT NULL,
	"periodStart" timestamp NOT NULL,
	"periodEnd" timestamp NOT NULL,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"deliveryStatus" "ledge_summary_delivery_status" NOT NULL,
	"providerMessageId" varchar(255),
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "ledge_summarySettings" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"recipientEmail" varchar(320) NOT NULL,
	"cadence" "ledge_summary_cadence" DEFAULT 'monthly' NOT NULL,
	"dayOfWeek" integer DEFAULT 1 NOT NULL,
	"dayOfMonth" integer DEFAULT 1 NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"enabled" "ledge_yes_no" DEFAULT 'no' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledge_summarySettings_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "ledge_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledge_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"authUserId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "ledge_user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledge_users_authUserId_unique" UNIQUE("authUserId")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ledge_accounts_user_code_unique" ON "ledge_accounts" USING btree ("userId","code");--> statement-breakpoint
CREATE INDEX "ledge_accounts_user_type_idx" ON "ledge_accounts" USING btree ("userId","type");--> statement-breakpoint
CREATE INDEX "ledge_contacts_user_kind_idx" ON "ledge_contacts" USING btree ("userId","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "ledge_expense_tags_unique" ON "ledge_expenseTags" USING btree ("expenseId","tagId");--> statement-breakpoint
CREATE INDEX "ledge_expense_tags_tag_idx" ON "ledge_expenseTags" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "ledge_expenses_user_date_idx" ON "ledge_expenses" USING btree ("userId","incurredAt");--> statement-breakpoint
CREATE INDEX "ledge_invoice_items_invoice_idx" ON "ledge_invoiceLineItems" USING btree ("invoiceId");--> statement-breakpoint
CREATE UNIQUE INDEX "ledge_invoices_user_number_unique" ON "ledge_invoices" USING btree ("userId","number");--> statement-breakpoint
CREATE UNIQUE INDEX "ledge_invoices_public_token_unique" ON "ledge_invoices" USING btree ("publicToken");--> statement-breakpoint
CREATE INDEX "ledge_invoices_user_status_idx" ON "ledge_invoices" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "ledge_invoices_customer_idx" ON "ledge_invoices" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "ledge_journal_entries_user_date_idx" ON "ledge_journalEntries" USING btree ("userId","postedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "ledge_journal_entry_tags_unique" ON "ledge_journalEntryTags" USING btree ("journalEntryId","tagId");--> statement-breakpoint
CREATE INDEX "ledge_journal_entry_tags_tag_idx" ON "ledge_journalEntryTags" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "ledge_journal_lines_entry_idx" ON "ledge_journalLines" USING btree ("journalEntryId");--> statement-breakpoint
CREATE INDEX "ledge_journal_lines_account_idx" ON "ledge_journalLines" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "ledge_quote_items_quote_idx" ON "ledge_quoteLineItems" USING btree ("quoteId");--> statement-breakpoint
CREATE INDEX "ledge_quote_items_service_idx" ON "ledge_quoteLineItems" USING btree ("serviceCatalogId");--> statement-breakpoint
CREATE UNIQUE INDEX "ledge_quotes_user_number_unique" ON "ledge_quotes" USING btree ("userId","number");--> statement-breakpoint
CREATE INDEX "ledge_quotes_user_status_idx" ON "ledge_quotes" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "ledge_quotes_customer_idx" ON "ledge_quotes" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "ledge_services_user_category_idx" ON "ledge_serviceCatalog" USING btree ("userId","category");--> statement-breakpoint
CREATE INDEX "ledge_services_user_active_idx" ON "ledge_serviceCatalog" USING btree ("userId","isActive");--> statement-breakpoint
CREATE INDEX "ledge_summary_deliveries_settings_idx" ON "ledge_summaryDeliveries" USING btree ("settingsId","sentAt");--> statement-breakpoint
CREATE UNIQUE INDEX "ledge_tags_user_name_unique" ON "ledge_tags" USING btree ("userId","name");--> statement-breakpoint
CREATE INDEX "ledge_tags_user_idx" ON "ledge_tags" USING btree ("userId");