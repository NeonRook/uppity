ALTER TABLE "monitor" ADD COLUMN "dead_lettered_at" timestamp with time zone;--> statement-breakpoint
-- Monitors parked by the old 24-hour dead-letter window become due now. Their
-- next failure enters dead letter under the new rules and notifies.
UPDATE "monitor" SET "next_check_at" = NOW(), "check_backoff_until" = NULL WHERE "check_last_error" LIKE 'Dead letter: %';
