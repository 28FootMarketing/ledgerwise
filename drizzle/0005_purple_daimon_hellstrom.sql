CREATE TABLE `quoteLineItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`serviceCatalogId` int,
	`description` varchar(280) NOT NULL,
	`category` varchar(96),
	`quantity` int NOT NULL,
	`unitAmountCents` int NOT NULL,
	`lineTotalCents` int NOT NULL,
	`quoteBillingFrequency` enum('one_time','monthly') NOT NULL DEFAULT 'one_time',
	CONSTRAINT `quoteLineItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`customerId` int NOT NULL,
	`number` varchar(48) NOT NULL,
	`title` varchar(180) NOT NULL,
	`quoteStatus` enum('draft','sent','accepted','declined','converted') NOT NULL DEFAULT 'draft',
	`issueAt` timestamp NOT NULL,
	`validUntil` timestamp,
	`notes` text,
	`oneTimeCents` int NOT NULL DEFAULT 0,
	`monthlyCents` int NOT NULL DEFAULT 0,
	`convertedInvoiceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotes_user_number_unique` UNIQUE(`userId`,`number`)
);
--> statement-breakpoint
CREATE TABLE `serviceCatalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`category` varchar(96) NOT NULL,
	`description` text,
	`defaultUnitAmountCents` int NOT NULL,
	`serviceBillingFrequency` enum('one_time','monthly') NOT NULL DEFAULT 'one_time',
	`serviceActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serviceCatalog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `quote_items_quote_idx` ON `quoteLineItems` (`quoteId`);--> statement-breakpoint
CREATE INDEX `quote_items_service_idx` ON `quoteLineItems` (`serviceCatalogId`);--> statement-breakpoint
CREATE INDEX `quotes_user_status_idx` ON `quotes` (`userId`,`quoteStatus`);--> statement-breakpoint
CREATE INDEX `quotes_customer_idx` ON `quotes` (`customerId`);--> statement-breakpoint
CREATE INDEX `services_user_category_idx` ON `serviceCatalog` (`userId`,`category`);--> statement-breakpoint
CREATE INDEX `services_user_active_idx` ON `serviceCatalog` (`userId`,`serviceActive`);