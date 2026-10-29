CREATE TABLE `production_data_collection_evidence` (
	`collection_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`captured_at` text,
	`attached_at` text NOT NULL,
	PRIMARY KEY(`collection_id`, `evidence_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `production_data_collections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_id`) REFERENCES `production_data_evidence`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `data_collection_evidence_owner` ON `production_data_collection_evidence` (`owner_id`);--> statement-breakpoint
CREATE TABLE `production_data_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`video_id` text NOT NULL,
	`job_id` text,
	`target_hours` integer NOT NULL,
	`sample_kind` text NOT NULL,
	`initial_published_at` text NOT NULL,
	`generated_at` text,
	`generated_for_due_at` text,
	`generated_request_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `production_data_videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `production_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_collection_window` ON `production_data_collections` (`owner_id`,`video_id`,`target_hours`);--> statement-breakpoint
CREATE INDEX `data_collection_owner` ON `production_data_collections` (`owner_id`);--> statement-breakpoint
ALTER TABLE `production_data_evidence` ADD `storage_kind` text DEFAULT 'd1' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_data_evidence` ADD `storage_key` text;