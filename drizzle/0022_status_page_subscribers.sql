CREATE TABLE "status_page_subscriber" (
	"id" text PRIMARY KEY NOT NULL,
	"status_page_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"confirmation_sent_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_page_subscriber_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "status_page_subscriber" ADD CONSTRAINT "status_page_subscriber_status_page_id_status_page_id_fk" FOREIGN KEY ("status_page_id") REFERENCES "public"."status_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "status_page_subscriber_page_email_idx" ON "status_page_subscriber" USING btree ("status_page_id","email");