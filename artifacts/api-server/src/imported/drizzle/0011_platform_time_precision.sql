-- Metadata only: existing timestamps, approvals and source receipts remain unchanged.
ALTER TABLE publishing_posts ADD COLUMN published_at_precision text NOT NULL DEFAULT 'second' CHECK(published_at_precision IN ('minute','second'));
--> statement-breakpoint
ALTER TABLE publishing_existing_posts ADD COLUMN published_at_precision text NOT NULL DEFAULT 'second' CHECK(published_at_precision IN ('minute','second'));
