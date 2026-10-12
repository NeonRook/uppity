-- Rows past the new bounds are clamped so the constraints can be added.
UPDATE "monitor" SET "timeout_seconds" = LEAST(GREATEST("timeout_seconds", 1), 60), "retries" = LEAST(GREATEST("retries", 0), 10)
WHERE "timeout_seconds" NOT BETWEEN 1 AND 60 OR "retries" NOT BETWEEN 0 AND 10;--> statement-breakpoint
ALTER TABLE "monitor" ADD CONSTRAINT "monitor_timeout_bounds" CHECK ("monitor"."timeout_seconds" BETWEEN 1 AND 60);--> statement-breakpoint
ALTER TABLE "monitor" ADD CONSTRAINT "monitor_retries_bounds" CHECK ("monitor"."retries" BETWEEN 0 AND 10);