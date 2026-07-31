--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_check_monitor_checked_idx" ON "monitor_check" ("monitor_id","checked_at");
