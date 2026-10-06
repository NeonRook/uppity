import { envInt } from "#lib/utils.js";

/** Number of monitors to claim per poll cycle */
export const WORKER_POLL_BATCH_SIZE = envInt("UPPITY_WORKER_BATCH_SIZE", 10);

/** Exponential backoff configuration for empty polls */
export const WORKER_BACKOFF = {
	INITIAL_MS: envInt("UPPITY_WORKER_BACKOFF_INITIAL_MS", 100),
	MAX_MS: envInt("UPPITY_WORKER_BACKOFF_MAX_MS", 5000),
	MULTIPLIER: 2,
} as const;

/** Backoff after the checker fails; MAX_ATTEMPTS failures in a row dead-letter the monitor. */
export const CHECK_RETRY = {
	MAX_ATTEMPTS: envInt("UPPITY_CHECK_MAX_RETRIES", 3),
	INITIAL_BACKOFF_MS: envInt("UPPITY_CHECK_BACKOFF_INITIAL_MS", 5000),
	MAX_BACKOFF_MS: envInt("UPPITY_CHECK_BACKOFF_MAX_MS", 300000), // 5 minutes
	MULTIPLIER: 2,
} as const;
