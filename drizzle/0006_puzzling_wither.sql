CREATE TABLE `production_promo_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`version` integer NOT NULL,
	`parent_id` text,
	`request_id` text NOT NULL,
	`script_revision` integer NOT NULL,
	`script_hash` text NOT NULL,
	`video_binding` text NOT NULL,
	`skill_hash` text NOT NULL,
	`input_snapshot` text NOT NULL,
	`origin` text NOT NULL,
	`status` text NOT NULL,
	`content` text,
	`content_hash` text,
	`receipt` text,
	`error` text,
	`lease_hash` text,
	`lease_until` integer,
	`invocation_id` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `production_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_promo_version` ON `production_promo_packages` (`job_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `production_promo_request` ON `production_promo_packages` (`job_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `production_promo_active` ON `production_promo_packages` (`job_id`) WHERE status IN ('queued','running');