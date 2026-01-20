CREATE TABLE "maintenance_job" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cron_expression" text NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"enabled" boolean DEFAULT true,
	CONSTRAINT "maintenance_job_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "monitor" ADD COLUMN "next_check_at" timestamp with time zone DEFAULT NOW();--> statement-breakpoint
ALTER TABLE "monitor" ADD COLUMN "check_retry_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "monitor" ADD COLUMN "check_last_error" text;--> statement-breakpoint
ALTER TABLE "monitor" ADD COLUMN "check_backoff_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_monitor_due_checks" ON "monitor" USING btree ("next_check_at") WHERE "monitor"."active" = true;