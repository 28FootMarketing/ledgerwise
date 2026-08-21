CREATE TABLE `journalEntryTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journalEntryId` int NOT NULL,
	`tagId` int NOT NULL,
	CONSTRAINT `journalEntryTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `journal_entry_tags_unique` UNIQUE(`journalEntryId`,`tagId`)
);
--> statement-breakpoint
CREATE INDEX `journal_entry_tags_tag_idx` ON `journalEntryTags` (`tagId`);