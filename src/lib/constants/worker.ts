import { envInt } from "$lib/utils";

/** Number of monitors to claim per poll cycle */
export const WORKER_POLL_BATCH_SIZE = envInt("UPPITY_WORKER_BATCH_SIZE", 10);

/** Base polling interval in milliseconds */
export const WORKER_POLL_INTERVAL_MS = envInt("UPPITY_WORKER_POLL_INTERVAL_MS", 1000);

/** Exponential backoff configuration for empty polls */
export const WORKER_BACKOFF = {
	INITIAL_MS: envInt("UPPITY_WORKER_BACKOFF_INITIAL_MS", 100),
	MAX_MS: envInt("UPPITY_WORKER_BACKOFF_MAX_MS", 5000),
	MULTIPLIER: 2,
} as const;

/** Check retry configuration for failed monitor checks */
export const CHECK_RETRY = {
	MAX_ATTEMPTS: envInt("UPPITY_CHECK_MAX_RETRIES", 3),
	INITIAL_BACKOFF_MS: envInt("UPPITY_CHECK_BACKOFF_INITIAL_MS", 5000),
	MAX_BACKOFF_MS: envInt("UPPITY_CHECK_BACKOFF_MAX_MS", 300000), // 5 minutes
	MULTIPLIER: 2,
} as const;

/** Hours before dead letter monitors are eligible for automatic recovery */
export const DEAD_LETTER_THRESHOLD_HOURS = envInt("UPPITY_DEAD_LETTER_HOURS", 24);
