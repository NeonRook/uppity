import { envInt, envString } from "#lib/utils.js";

/** Cron schedule for aggregating the previous day's check data into daily stats. */
export const CRON_DAILY_STATS = envString("UPPITY_CRON_DAILY_STATS", "0 1 * * *");

/** Cron schedule for recalculating rolling 24-hour uptime and response time stats. */
export const CRON_ROLLING_STATS = envString("UPPITY_CRON_ROLLING_STATS", "*/5 * * * *");

/** Cron schedule for deleting check records older than the retention period. */
export const CRON_CLEANUP = envString("UPPITY_CRON_CLEANUP", "0 2 * * *");

/** Cron schedule for reporting per-organization usage snapshots to Polar meters. */
export const CRON_USAGE_SNAPSHOT = envString("UPPITY_CRON_USAGE_SNAPSHOT", "0 3 * * *");

/** Cron schedule for advancing maintenance window status transitions. */
export const CRON_MAINTENANCE_WINDOW_TRANSITIONS = envString(
	"UPPITY_CRON_MAINTENANCE_WINDOW_TRANSITIONS",
	"* * * * *",
);

/** Number of days to keep individual check records before cleanup deletes them. */
export const CHECK_RETENTION_DAYS = envInt("UPPITY_CHECK_RETENTION_DAYS", 30);
