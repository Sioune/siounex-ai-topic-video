CREATE TABLE `production_data_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`image_base64` text NOT NULL,
	`captured_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_evidence_bytes` ON `production_data_evidence` (`owner_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `production_data_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`new_video_id` text NOT NULL,
	`old_video_id` text NOT NULL,
	`published_anchor` text NOT NULL,
	`exposure_start` integer,
	`exposure_end` integer,
	`evidence_note` text NOT NULL,
	`record_hash` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`new_video_id`) REFERENCES `production_data_videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`old_video_id`) REFERENCES `production_data_videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_relation_request` ON `production_data_relations` (`request_id`);--> statement-breakpoint
CREATE TABLE `production_data_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`sample_kind` text NOT NULL,
	`relation_id` text,
	`observed_at` text,
	`metrics` text NOT NULL,
	`evidence_ids` text NOT NULL,
	`note` text NOT NULL,
	`record_hash` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `production_data_videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`relation_id`) REFERENCES `production_data_relations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_sample_request` ON `production_data_samples` (`request_id`);--> statement-breakpoint
CREATE TABLE `production_data_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`title` text NOT NULL,
	`topic_type` text NOT NULL,
	`published_at` text,
	`publication_source` text NOT NULL,
	`job_id` text,
	`supersedes_id` text,
	`duration` integer,
	`record_hash` text NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `production_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_video_request` ON `production_data_videos` (`request_id`);