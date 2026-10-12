-- NOTE: This migration is hand-edited. drizzle-kit generated only the column and
-- the index; it does not emit defaults dropped in the same migration, functions or
-- triggers. Re-add everything below the index if you regenerate it.
--
-- The default marks every existing row as processed without rewriting the table:
-- PostgreSQL evaluates a non-volatile default once and stores it in the catalog.
-- Dropping it leaves new rows NULL, which is what the processor picks up.
ALTER TABLE "monitor_check" ADD COLUMN "processed_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "monitor_check" ALTER COLUMN "processed_at" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "monitor_check_unprocessed_idx" ON "monitor_check" USING btree ("monitor_id") WHERE "monitor_check"."processed_at" IS NULL;--> statement-breakpoint
CREATE FUNCTION notify_monitor_check() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('monitor_check', NEW.monitor_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER monitor_check_notify
AFTER INSERT ON "monitor_check"
FOR EACH ROW EXECUTE FUNCTION notify_monitor_check();
