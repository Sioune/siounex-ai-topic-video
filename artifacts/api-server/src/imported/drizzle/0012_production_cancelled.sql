-- Terminal owner cancellation also fences callbacks admitted before the cancel.
-- Existing artifacts, approvals, and provider outcomes are left intact.
CREATE TRIGGER production_cancelled_terminal
BEFORE UPDATE OF status ON production_jobs
WHEN OLD.status='cancelled' AND NEW.status<>'cancelled'
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_drafts_cancelled_insert
BEFORE INSERT ON production_drafts
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_drafts_cancelled_update
BEFORE UPDATE ON production_drafts
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_stages_cancelled_insert
BEFORE INSERT ON production_stages
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_stages_cancelled_update
BEFORE UPDATE ON production_stages
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_milestones_cancelled_insert
BEFORE INSERT ON production_milestones
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_milestones_cancelled_update
BEFORE UPDATE ON production_milestones
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_operations_cancelled_insert
BEFORE INSERT ON production_operations
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_operations_cancelled_update
BEFORE UPDATE ON production_operations
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_promo_packages_cancelled_insert
BEFORE INSERT ON production_promo_packages
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;

--> statement-breakpoint
CREATE TRIGGER production_promo_packages_cancelled_update
BEFORE UPDATE ON production_promo_packages
WHEN EXISTS(SELECT 1 FROM production_jobs WHERE id=NEW.job_id AND status='cancelled')
BEGIN
 SELECT RAISE(ABORT, 'PRODUCTION_CANCELLED');
END;
