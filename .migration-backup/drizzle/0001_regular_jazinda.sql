CREATE TABLE `dispositions` (
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `topic_id`),
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `topics` ADD `content_lang` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `event_key` text;--> statement-breakpoint
ALTER TABLE `topics` ADD `related_urls` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `updated_at` text;