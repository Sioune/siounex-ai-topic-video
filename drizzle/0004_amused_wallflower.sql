DROP INDEX `production_milestone_version`;--> statement-breakpoint
ALTER TABLE `production_milestones` ADD `artifact_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `production_milestone_version` ON `production_milestones` (`job_id`,`node`,`revision`,`artifact_version`);