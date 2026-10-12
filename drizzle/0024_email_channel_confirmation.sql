CREATE TABLE "channel_confirmation_send" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"token" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_channel" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "notification_channel" ADD COLUMN "confirmation_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_channel" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_channel" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_confirmation_send" ADD CONSTRAINT "channel_confirmation_send_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_confirmation_send_org_sent_idx" ON "channel_confirmation_send" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "channel_confirmation_send_token_idx" ON "channel_confirmation_send" USING btree ("token");--> statement-breakpoint
ALTER TABLE "notification_channel" ADD CONSTRAINT "notification_channel_token_unique" UNIQUE("token");--> statement-breakpoint
-- Existing email channels keep receiving alerts, and get a token for their unsubscribe link.
UPDATE "notification_channel"
SET "token" = rtrim(translate(encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '='),
	"verified_at" = "created_at"
WHERE "type" = 'email';
