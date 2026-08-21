CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."billing_frequency" AS ENUM('one_time', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."contact_kind" AS ENUM('customer', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."journal_source_type" AS ENUM('manual', 'invoice', 'expense', 'payment');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'converted');--> statement-breakpoint
CREATE TYPE "public"."summary_cadence" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."summary_delivery_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."yes_no" AS ENUM('yes', 'no');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" "account_type" NOT NULL,
	"description" text,
	"isSystem" "yes_no" DEFAULT 'no' NOT NULL,
	"isActive" "yes_no" DEFAULT 'yes' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"kind" "contact_kind" NOT NULL,
	"name" varchar(180) NOT NULL,
	"email" varchar(320),
	"phone" varchar(48),
	"address" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenseTags" (
	"id" serial PRIMARY KEY NOT NULL,
	"expenseId" integer NOT NULL,
	"tagId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
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
CREATE TABLE "invoiceLineItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoiceId" integer NOT NULL,
	"description" varchar(280) NOT NULL,
	"quantity" integer NOT NULL,
	"unitAmountCents" integer NOT NULL,
	"lineTotalCents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"customerId" integer NOT NULL,
	"number" varchar(48) NOT NULL,
	"publicToken" varchar(32) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
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
CREATE TABLE "journalEntries" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"postedAt" timestamp NOT NULL,
	"memo" varchar(280),
	"sourceType" "journal_source_type" DEFAULT 'manual' NOT NULL,
	"sourceId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journalEntryTags" (
	"id" serial PRIMARY KEY NOT NULL,
	"journalEntryId" integer NOT NULL,
	"tagId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journalLines" (
	"id" serial PRIMARY KEY NOT NULL,
	"journalEntryId" integer NOT NULL,
	"accountId" integer NOT NULL,
	"debitCents" integer DEFAULT 0 NOT NULL,
	"creditCents" integer DEFAULT 0 NOT NULL,
	"description" varchar(280)
);
--> statement-breakpoint
CREATE TABLE "quoteLineItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"quoteId" integer NOT NULL,
	"serviceCatalogId" integer,
	"description" varchar(280) NOT NULL,
	"category" varchar(96),
	"quantity" integer NOT NULL,
	"unitAmountCents" integer NOT NULL,
	"lineTotalCents" integer NOT NULL,
	"billingFrequency" "billing_frequency" DEFAULT 'one_time' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"customerId" integer NOT NULL,
	"number" varchar(48) NOT NULL,
	"title" varchar(180) NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
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
CREATE TABLE "serviceCatalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"category" varchar(96) NOT NULL,
	"description" text,
	"defaultUnitAmountCents" integer NOT NULL,
	"billingFrequency" "billing_frequency" DEFAULT 'one_time' NOT NULL,
	"isActive" "yes_no" DEFAULT 'yes' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "summaryDeliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"settingsId" integer NOT NULL,
	"periodStart" timestamp NOT NULL,
	"periodEnd" timestamp NOT NULL,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"deliveryStatus" "summary_delivery_status" NOT NULL,
	"providerMessageId" varchar(255),
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "summarySettings" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"recipientEmail" varchar(320) NOT NULL,
	"cadence" "summary_cadence" DEFAULT 'monthly' NOT NULL,
	"dayOfWeek" integer DEFAULT 1 NOT NULL,
	"dayOfMonth" integer DEFAULT 1 NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"enabled" "yes_no" DEFAULT 'no' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "summarySettings_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"authUserId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_authUserId_unique" UNIQUE("authUserId")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_code_unique" ON "accounts" USING btree ("userId","code");--> statement-breakpoint
CREATE INDEX "accounts_user_type_idx" ON "accounts" USING btree ("userId","type");--> statement-breakpoint
CREATE INDEX "contacts_user_kind_idx" ON "contacts" USING btree ("userId","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_tags_unique" ON "expenseTags" USING btree ("expenseId","tagId");--> statement-breakpoint
CREATE INDEX "expense_tags_tag_idx" ON "expenseTags" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "expenses_user_date_idx" ON "expenses" USING btree ("userId","incurredAt");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoiceLineItems" USING btree ("invoiceId");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_user_number_unique" ON "invoices" USING btree ("userId","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_public_token_unique" ON "invoices" USING btree ("publicToken");--> statement-breakpoint
CREATE INDEX "invoices_user_status_idx" ON "invoices" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "journal_entries_user_date_idx" ON "journalEntries" USING btree ("userId","postedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entry_tags_unique" ON "journalEntryTags" USING btree ("journalEntryId","tagId");--> statement-breakpoint
CREATE INDEX "journal_entry_tags_tag_idx" ON "journalEntryTags" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journalLines" USING btree ("journalEntryId");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journalLines" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "quote_items_quote_idx" ON "quoteLineItems" USING btree ("quoteId");--> statement-breakpoint
CREATE INDEX "quote_items_service_idx" ON "quoteLineItems" USING btree ("serviceCatalogId");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_user_number_unique" ON "quotes" USING btree ("userId","number");--> statement-breakpoint
CREATE INDEX "quotes_user_status_idx" ON "quotes" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "services_user_category_idx" ON "serviceCatalog" USING btree ("userId","category");--> statement-breakpoint
CREATE INDEX "services_user_active_idx" ON "serviceCatalog" USING btree ("userId","isActive");--> statement-breakpoint
CREATE INDEX "summary_deliveries_settings_idx" ON "summaryDeliveries" USING btree ("settingsId","sentAt");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_unique" ON "tags" USING btree ("userId","name");--> statement-breakpoint
CREATE INDEX "tags_user_idx" ON "tags" USING btree ("userId");