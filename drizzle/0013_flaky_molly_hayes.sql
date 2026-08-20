-- Added nullable so the backfill can run before the constraint lands. Adding it
-- NOT NULL in one step aborts on any table that already holds accounts.
ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint

-- better-auth identifies an external account by the pair (issuer, account_id).
-- Email+password is the only provider enabled here, and its accounts carry
-- provider_id 'credential' with account_id already set to the user id, so
-- 'local:credential' is the whole backfill for a stock install.
--
-- A deployment that added a social provider is left with null issuers on those
-- rows and the SET NOT NULL below aborts. That is deliberate: the correct value
-- is the provider's own issuer URL, which this migration cannot know, and a
-- synthetic stand-in would break account linking silently instead of loudly.
UPDATE "account" SET "issuer" = 'local:credential' WHERE "provider_id" = 'credential';--> statement-breakpoint

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");
