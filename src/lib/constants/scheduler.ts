import { envInt, envString } from "$lib/utils";

/** Cron schedule for aggregating the previous day's check data into daily stats. */
export const CRON_DAILY_STATS = envString("UPPITY_CRON_DAILY_STATS", "0 1 * * *");

/** Cron schedule for recalculating rolling 24-hour uptime and response time stats. */
export const CRON_ROLLING_STATS = envString("UPPITY_CRON_ROLLING_STATS", "*/5 * * * *");

/** Cron schedule for deleting check records older than the retention period. */
export const CRON_CLEANUP = envString("UPPITY_CRON_CLEANUP", "0 2 * * *");

/** Number of days to keep individual check records before cleanup deletes them. */
export const CHECK_RETENTION_DAYS = envInt("UPPITY_CHECK_RETENTION_DAYS", 30);

/** How frequently the scheduler polls for queued monitor checks to execute. */
export const QUEUE_POLL_INTERVAL_MS = envInt("UPPITY_QUEUE_POLL_INTERVAL_MS", 100);

/** Intervals shorter than this use second-precision scheduling via minute-based cron. */
export const MINUTE_THRESHOLD_SECONDS = 60;

/** Intervals shorter than this use minute-based cron; longer intervals use hourly cron. */
export const HOUR_THRESHOLD_SECONDS = 3600;
