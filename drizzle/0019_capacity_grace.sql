ALTER TABLE "monitor" ADD COLUMN "capacity_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "over_capacity_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "capacity_notice" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "capacity_noticed_at" timestamp with time zone;