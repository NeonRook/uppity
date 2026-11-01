ALTER TABLE "organization" ADD COLUMN "subscriber_email_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- One-off: pending rows count because they came through the ungated flow, and their
-- confirmation links are still out. After this only staff set the switch.
UPDATE "organization" SET "subscriber_email_enabled" = true
WHERE "id" IN (
	SELECT "status_page"."organization_id"
	FROM "status_page"
	INNER JOIN "status_page_subscriber" ON "status_page_subscriber"."status_page_id" = "status_page"."id"
);
