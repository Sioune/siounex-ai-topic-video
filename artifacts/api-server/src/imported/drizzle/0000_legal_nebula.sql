CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `topic_id`),
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_status` (
	`id` text PRIMARY KEY NOT NULL,
	`last_attempt` text,
	`last_success` text,
	`state` text NOT NULL,
	`message` text NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`source_id` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`original_title` text NOT NULL,
	`summary` text NOT NULL,
	`published_at` text,
	`collected_at` text NOT NULL,
	`category` text NOT NULL,
	`score` integer NOT NULL,
	`material` text NOT NULL,
	`highlight` text NOT NULL,
	`angle` text NOT NULL,
	`materials` text NOT NULL,
	`risk` text NOT NULL,
	`media_url` text,
	`media_type` text,
	`curated` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_topics_url` ON `topics` (`url`);--> statement-breakpoint
CREATE INDEX `idx_topics_published` ON `topics` (`published_at`);