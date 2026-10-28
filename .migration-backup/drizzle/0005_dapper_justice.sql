CREATE TABLE `production_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`node` text NOT NULL,
	`revision` integer NOT NULL,
	`script_hash` text NOT NULL,
	`mode_epoch` integer NOT NULL,
	`base_artifact_version` integer NOT NULL,
	`input_hash` text NOT NULL,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`lease_hash` text,
	`lease_until` integer,
	`invocation_id` text,
	`checkpoint_version` integer DEFAULT 0 NOT NULL,
	`checkpoint` text DEFAULT '{}' NOT NULL,
	`result` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `production_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_operation_input` ON `production_operations` (`job_id`,`node`,`revision`,`base_artifact_version`,`input_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `production_one_live_operation` ON `production_operations` (`job_id`,`node`,`revision`,`base_artifact_version`) WHERE status IN ('queued','running','prepared');