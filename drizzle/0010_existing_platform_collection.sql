CREATE TABLE publishing_existing_posts (
 id text PRIMARY KEY NOT NULL, owner_id text NOT NULL, job_id text NOT NULL REFERENCES production_jobs(id),
 data_video_id text REFERENCES production_data_videos(id), title text NOT NULL, platform text NOT NULL,
 account_id text, external_post_id text, platform_url text, platform_published_at text,
 verification_state text NOT NULL, identity_method text NOT NULL, evidence_reference text,
 evidence_note text NOT NULL, observed_at text NOT NULL, reason text, version integer NOT NULL DEFAULT 1,
 record_hash text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX existing_platform_job ON publishing_existing_posts(owner_id,job_id,platform);
--> statement-breakpoint
CREATE UNIQUE INDEX existing_platform_identity ON publishing_existing_posts(owner_id,platform,account_id,external_post_id);
--> statement-breakpoint
CREATE TABLE publishing_existing_collections (
 id text PRIMARY KEY NOT NULL, owner_id text NOT NULL, post_id text NOT NULL REFERENCES publishing_existing_posts(id),
 sample_kind text NOT NULL, target_hours integer, collection_key text NOT NULL, anchor_published_at text NOT NULL,
 due_at text NOT NULL, status text NOT NULL, observed_at text, metrics text, source text, reason text,
 lease_hash text, lease_until integer, attempt integer NOT NULL DEFAULT 0, next_retry_at text,
 created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX existing_collection_once ON publishing_existing_collections(post_id,collection_key);
--> statement-breakpoint
CREATE INDEX existing_collection_due ON publishing_existing_collections(owner_id,status,due_at);
