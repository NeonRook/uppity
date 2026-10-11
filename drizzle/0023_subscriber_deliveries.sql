CREATE TABLE "status_page_subscriber_delivery" (
	"event_id" text NOT NULL,
	"subscriber_id" text NOT NULL,
	CONSTRAINT "status_page_subscriber_delivery_event_id_subscriber_id_pk" PRIMARY KEY("event_id","subscriber_id")
);
--> statement-breakpoint
ALTER TABLE "status_page_subscriber_delivery" ADD CONSTRAINT "status_page_subscriber_delivery_event_id_notification_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."notification_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_subscriber_delivery" ADD CONSTRAINT "status_page_subscriber_delivery_subscriber_id_status_page_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."status_page_subscriber"("id") ON DELETE cascade ON UPDATE no action;