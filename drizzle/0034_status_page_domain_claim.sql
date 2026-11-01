CREATE TABLE "status_page_domain_claim" (
	"status_page_id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"token" text NOT NULL,
	"verified_target" text,
	"failed_checks" integer DEFAULT 0 NOT NULL,
	"lapsed_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_page_domain_claim_domain_canonical" CHECK ("status_page_domain_claim"."domain" = lower(rtrim("status_page_domain_claim"."domain", '.')))
);
--> statement-breakpoint
ALTER TABLE "status_page_domain_claim" ADD CONSTRAINT "status_page_domain_claim_status_page_id_status_page_id_fk" FOREIGN KEY ("status_page_id") REFERENCES "public"."status_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- One-off: no stored domain has proved anything, so each becomes an unverified claim that serves
-- nothing until its owner verifies it. Variants of one name may each hold a claim, because claims
-- reserve nothing. From here on status_page.custom_domain holds only verified domains, and routing
-- reads it.
INSERT INTO "status_page_domain_claim" ("status_page_id", "domain", "token")
SELECT "id", lower(rtrim(btrim("custom_domain"), '.')), replace(gen_random_uuid()::text, '-', '')
FROM "status_page"
WHERE rtrim(btrim("custom_domain"), '.') <> '';--> statement-breakpoint
UPDATE "status_page" SET "custom_domain" = NULL WHERE "custom_domain" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "status_page" ADD CONSTRAINT "status_page_custom_domain_canonical" CHECK ("status_page"."custom_domain" = lower(rtrim("status_page"."custom_domain", '.')));