CREATE TABLE `production_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`node` text NOT NULL,
	`revision` integer NOT NULL,
	`artifact_hash` text NOT NULL,
	`artifact` text NOT NULL,
	`status` text NOT NULL,
	`mode_epoch` integer NOT NULL,
	`review_token_hash` text,
	`review_until` integer,
	`invocation_id` text,
	`report` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `production_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_milestone_version` ON `production_milestones` (`job_id`,`node`,`revision`);--> statement-breakpoint
ALTER TABLE `production_jobs` ADD `review_mode` text DEFAULT 'node' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_jobs` ADD `mode_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `production_jobs` ADD `reworks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `production_jobs` ADD `ai_calls` integer DEFAULT 0 NOT NULL;