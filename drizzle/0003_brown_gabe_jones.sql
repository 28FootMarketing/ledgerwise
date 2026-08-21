CREATE TABLE `expenseTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`expenseId` int NOT NULL,
	`tagId` int NOT NULL,
	CONSTRAINT `expenseTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `expense_tags_unique` UNIQUE(`expenseId`,`tagId`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_user_name_unique` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE INDEX `expense_tags_tag_idx` ON `expenseTags` (`tagId`);--> statement-breakpoint
CREATE INDEX `tags_user_idx` ON `tags` (`userId`);