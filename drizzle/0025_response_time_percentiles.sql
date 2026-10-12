ALTER TABLE "monitor_daily_stats" ADD COLUMN "degraded_checks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitor_daily_stats" ADD COLUMN "p95_response_time_ms" integer;--> statement-breakpoint
-- Backfills only days whose checks are all still retained, so no day gets figures from part of its checks.
UPDATE "monitor_daily_stats" AS s
SET "degraded_checks" = c.degraded,
	"p95_response_time_ms" = c.p95
FROM (
	SELECT "monitor_id",
		date_trunc('day', "checked_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS day,
		count(*) AS total,
		count(*) FILTER (WHERE "status" = 'degraded') AS degraded,
		round(percentile_cont(0.95) WITHIN GROUP (ORDER BY "response_time_ms") FILTER (WHERE "status" <> 'down')) AS p95
	FROM "monitor_check"
	GROUP BY 1, 2
) AS c
WHERE s."monitor_id" = c."monitor_id" AND s."date" = c.day AND s."total_checks" = c.total;
