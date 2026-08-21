ALTER TABLE `invoices` ADD `publicToken` varchar(32);--> statement-breakpoint
UPDATE `invoices` SET `publicToken` = CONCAT('legacy_', `id`) WHERE `publicToken` IS NULL;--> statement-breakpoint
ALTER TABLE `invoices` MODIFY `publicToken` varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_public_token_unique` UNIQUE(`publicToken`);
