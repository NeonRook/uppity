-- better-auth identifies an external account by (provider_id, account_id) again;
-- issuer was a short-lived requirement that upstream withdrew.
--
-- The index goes before the column. Dropping the column first leaves some
-- dialects rebuilding the index on account_id alone, which turns it into a
-- unique constraint that blocks a user from holding two accounts.
DROP INDEX "account_issuer_accountId_uidx";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "issuer";
