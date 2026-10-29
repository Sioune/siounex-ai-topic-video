CREATE TABLE publishing_authorizations (
 id text PRIMARY KEY NOT NULL, owner_id text NOT NULL, request_id text NOT NULL,
 reference text NOT NULL, content_hash text NOT NULL, created_at text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX publishing_authorization_request ON publishing_authorizations(owner_id,request_id);
--> statement-breakpoint
CREATE TABLE publishing_plans (
 owner_id text PRIMARY KEY NOT NULL, enabled integer NOT NULL DEFAULT 0,
 authorization_id text REFERENCES publishing_authorizations(id), active_since text,
 created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE TABLE publishing_reserve (
 id text PRIMARY KEY NOT NULL, owner_id text NOT NULL, job_id text NOT NULL REFERENCES production_jobs(id),
 binding text NOT NULL, binding_hash text NOT NULL, title text NOT NULL, approved_at text NOT NULL,
 status text NOT NULL, reason text, created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX publishing_reserve_binding ON publishing_reserve(owner_id,binding_hash);
--> statement-breakpoint
CREATE INDEX publishing_fifo ON publishing_reserve(owner_id,status,approved_at,id);
--> statement-breakpoint
CREATE TABLE publishing_slots (
 id text PRIMARY KEY NOT NULL, owner_id text NOT NULL, scheduled_at text NOT NULL,
 authorization_id text NOT NULL REFERENCES publishing_authorizations(id),
 release_id text REFERENCES publishing_reserve(id), status text NOT NULL, reason text,
 created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX publishing_slot_once ON publishing_slots(owner_id,scheduled_at);
--> statement-breakpoint
CREATE TABLE publishing_posts (
 id text PRIMARY KEY NOT NULL, owner_id text NOT NULL, release_id text NOT NULL REFERENCES publishing_reserve(id),
 slot_id text NOT NULL REFERENCES publishing_slots(id), platform text NOT NULL, account_id text,
 idempotency_key text NOT NULL, status text NOT NULL, external_post_id text, platform_url text,
 published_at text, reason text, receipt text, lease_hash text, lease_until integer,
 created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX publishing_post_business ON publishing_posts(release_id,platform);
--> statement-breakpoint
CREATE UNIQUE INDEX publishing_post_external ON publishing_posts(owner_id,platform,account_id,external_post_id);
--> statement-breakpoint
CREATE TABLE publishing_collections (
 id text PRIMARY KEY NOT NULL, owner_id text NOT NULL, post_id text NOT NULL REFERENCES publishing_posts(id),
 target_hours integer NOT NULL, due_at text NOT NULL, status text NOT NULL,
 observed_at text, metrics text, source text, reason text, lease_hash text, lease_until integer,
 attempt integer NOT NULL DEFAULT 0, next_retry_at text, created_at text NOT NULL, updated_at text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX publishing_collection_window ON publishing_collections(post_id,target_hours);
--> statement-breakpoint
CREATE INDEX publishing_collection_due ON publishing_collections(owner_id,status,due_at);
