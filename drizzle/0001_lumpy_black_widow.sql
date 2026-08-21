CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`code` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`accountType` enum('asset','liability','equity','income','expense') NOT NULL,
	`description` text,
	`isSystem` enum('yes','no') NOT NULL DEFAULT 'no',
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_user_code_unique` UNIQUE(`userId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contactKind` enum('customer','vendor') NOT NULL,
	`name` varchar(180) NOT NULL,
	`email` varchar(320),
	`phone` varchar(48),
	`address` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`vendorId` int,
	`expenseAccountId` int NOT NULL,
	`paymentAccountId` int NOT NULL,
	`amountCents` int NOT NULL,
	`incurredAt` timestamp NOT NULL,
	`notes` text,
	`journalEntryId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoiceLineItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`description` varchar(280) NOT NULL,
	`quantity` int NOT NULL,
	`unitAmountCents` int NOT NULL,
	`lineTotalCents` int NOT NULL,
	CONSTRAINT `invoiceLineItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`customerId` int NOT NULL,
	`number` varchar(48) NOT NULL,
	`invoiceStatus` enum('draft','sent','paid','overdue') NOT NULL DEFAULT 'draft',
	`issueAt` timestamp NOT NULL,
	`dueAt` timestamp NOT NULL,
	`subtotalCents` int NOT NULL DEFAULT 0,
	`taxCents` int NOT NULL DEFAULT 0,
	`totalCents` int NOT NULL DEFAULT 0,
	`notes` text,
	`journalEntryId` int,
	`stripeCheckoutSessionId` varchar(255),
	`stripePaymentIntentId` varchar(255),
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_user_number_unique` UNIQUE(`userId`,`number`)
);
--> statement-breakpoint
CREATE TABLE `journalEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`postedAt` timestamp NOT NULL,
	`memo` varchar(280),
	`journalSourceType` enum('manual','invoice','expense','payment') NOT NULL DEFAULT 'manual',
	`sourceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `journalEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `journalLines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journalEntryId` int NOT NULL,
	`accountId` int NOT NULL,
	`debitCents` int NOT NULL DEFAULT 0,
	`creditCents` int NOT NULL DEFAULT 0,
	`description` varchar(280),
	CONSTRAINT `journalLines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `summaryDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingsId` int NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`summaryDeliveryStatus` enum('sent','failed') NOT NULL,
	`providerMessageId` varchar(255),
	`errorMessage` text,
	CONSTRAINT `summaryDeliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `summarySettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`recipientEmail` varchar(320) NOT NULL,
	`summaryCadence` enum('weekly','monthly') NOT NULL DEFAULT 'monthly',
	`dayOfWeek` int NOT NULL DEFAULT 1,
	`dayOfMonth` int NOT NULL DEFAULT 1,
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`summaryEnabled` enum('yes','no') NOT NULL DEFAULT 'no',
	`scheduleCronTaskUid` varchar(65),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `summarySettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `summarySettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `accounts_user_type_idx` ON `accounts` (`userId`,`accountType`);--> statement-breakpoint
CREATE INDEX `contacts_user_kind_idx` ON `contacts` (`userId`,`contactKind`);--> statement-breakpoint
CREATE INDEX `expenses_user_date_idx` ON `expenses` (`userId`,`incurredAt`);--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoiceLineItems` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `invoices_user_status_idx` ON `invoices` (`userId`,`invoiceStatus`);--> statement-breakpoint
CREATE INDEX `invoices_customer_idx` ON `invoices` (`customerId`);--> statement-breakpoint
CREATE INDEX `journal_entries_user_date_idx` ON `journalEntries` (`userId`,`postedAt`);--> statement-breakpoint
CREATE INDEX `journal_lines_entry_idx` ON `journalLines` (`journalEntryId`);--> statement-breakpoint
CREATE INDEX `journal_lines_account_idx` ON `journalLines` (`accountId`);--> statement-breakpoint
CREATE INDEX `summary_deliveries_settings_idx` ON `summaryDeliveries` (`settingsId`,`sentAt`);--> statement-breakpoint
CREATE INDEX `summary_schedule_uid_idx` ON `summarySettings` (`scheduleCronTaskUid`);