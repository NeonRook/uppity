-- NOTE: This migration includes a manually appended pg_notify trigger
-- at the bottom. If you regenerate with drizzle-kit generate, you must
-- re-add the trigger block.
CREATE TABLE "notification_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"monitor_id" text,
	"incident_id" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claimed_at" timestamp,
	"processed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_monitor_id_monitor_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_event" ADD CONSTRAINT "notification_event_incident_id_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_event_status_created_idx" ON "notification_event" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notification_event_monitor_type_idx" ON "notification_event" USING btree ("monitor_id","type","created_at");--> statement-breakpoint
CREATE INDEX "notification_event_org_idx" ON "notification_event" USING btree ("organization_id","created_at");
--> statement-breakpoint
-- MANUAL ADDITION: pg_notify trigger. Drizzle does not emit triggers.
-- Do NOT regenerate this file — re-add this block if you do.
CREATE FUNCTION notify_notification_event() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('notification_event', NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER notification_event_notify
AFTER INSERT ON "notification_event"
FOR EACH ROW EXECUTE FUNCTION notify_notification_event();
