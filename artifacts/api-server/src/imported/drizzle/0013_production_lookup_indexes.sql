CREATE INDEX `site_archive_job_lookup` ON `app_state` (json_extract(value, '$.job_id')) WHERE key >= 'site_archive_v1:' AND key < 'site_archive_v1;';
--> statement-breakpoint
CREATE INDEX `data_video_job_published` ON `production_data_videos` (`job_id`,`published_at`);
--> statement-breakpoint
CREATE INDEX `production_reviews_job_created` ON `production_reviews` (`job_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `production_reviews_job_binding` ON `production_reviews` (`job_id`,`revision`,`decision`,`content_hash`);
