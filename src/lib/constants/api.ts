import { envInt } from "#lib/utils.js";

/** Requests per minute per key on plans whose `apiRequestsPerMinute` is -1. */
export const API_REQUESTS_PER_MINUTE = envInt("UPPITY_API_REQUESTS_PER_MINUTE", 600);

/** Window the per-key request count resets over. */
export const API_RATE_LIMIT_WINDOW_MS = 60_000;

/** Keys one organization may hold, so extra keys cannot multiply the rate limit. */
export const API_KEYS_PER_ORGANIZATION = 10;

/** Marks a string as an Uppity key, for secret scanners and for people. */
export const API_KEY_PREFIX = "upt_";
