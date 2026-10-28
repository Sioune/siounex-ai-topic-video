CREATE TABLE `production_drafts` (
	`job_id` text NOT NULL,
	`revision` integer NOT NULL,
	`submission_id` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`executor` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`job_id`, `revision`),
	FOREIGN KEY (`job_id`) REFERENCES `production_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_submit_once` ON `production_drafts` (`job_id`,`submission_id`);--> statement-breakpoint
CREATE TABLE `production_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`owner_id` text,
	`is_test` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`source_snapshot` text NOT NULL,
	`skill_snapshot` text NOT NULL,
	`contract_hash` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`checkpoint_version` integer DEFAULT 0 NOT NULL,
	`checkpoint` text DEFAULT '{}' NOT NULL,
	`lease_hash` text,
	`lease_until` integer,
	`executor` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`error` text,
	`review_note` text,
	`approved_revision` integer,
	`approved_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_one_job_per_topic` ON `production_jobs` (`topic_id`);--> statement-breakpoint
CREATE TABLE `production_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`revision` integer NOT NULL,
	`content_hash` text NOT NULL,
	`decision` text NOT NULL,
	`note` text NOT NULL,
	`reviewer` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `production_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `production_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`stage` text NOT NULL,
	`review_revision` integer NOT NULL,
	`review_hash` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`provider_job_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `production_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_stage_once` ON `production_stages` (`job_id`,`stage`,`review_revision`);