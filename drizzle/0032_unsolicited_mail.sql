CREATE TABLE "organization_mail_block" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsolicited_mail_send" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_event" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "organization_mail_block" ADD CONSTRAINT "organization_mail_block_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsolicited_mail_send" ADD CONSTRAINT "unsolicited_mail_send_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unsolicited_mail_send_sent_idx" ON "unsolicited_mail_send" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "unsolicited_mail_send_email_sent_idx" ON "unsolicited_mail_send" USING btree ("email","sent_at");--> statement-breakpoint
CREATE INDEX "unsolicited_mail_send_org_sent_idx" ON "unsolicited_mail_send" USING btree ("organization_id","sent_at");--> statement-breakpoint
ALTER TABLE "mail_event" ADD CONSTRAINT "mail_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;