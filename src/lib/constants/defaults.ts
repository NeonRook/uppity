import { envInt } from "$lib/utils";

/** Monitor interval constraints for worker scheduler */
export const MONITOR_INTERVAL = {
	MIN_SECONDS: envInt("UPPITY_MIN_INTERVAL_SECONDS", 30),
	MAX_SECONDS: envInt("UPPITY_MAX_INTERVAL_SECONDS", 86400), // 24 hours
	DEFAULT_SECONDS: envInt("UPPITY_DEFAULT_INTERVAL_SECONDS", 60),
} as const;

/** How long to wait for a monitor check response before timing out. */
export const DEFAULT_TIMEOUT_SECONDS = envInt("UPPITY_DEFAULT_TIMEOUT_SECONDS", 30);

/** Time between consecutive health checks for a monitor. */
export const DEFAULT_INTERVAL_SECONDS = MONITOR_INTERVAL.DEFAULT_SECONDS;

/** Number of retry attempts after a failed check before marking as down. */
export const DEFAULT_RETRIES = envInt("UPPITY_DEFAULT_RETRIES", 0);

/** Consecutive failures required before sending an alert notification. */
export const DEFAULT_ALERT_AFTER_FAILURES = envInt("UPPITY_DEFAULT_ALERT_AFTER_FAILURES", 1);

/** Extra time allowed after expected heartbeat before marking push monitor as down. */
export const DEFAULT_PUSH_GRACE_PERIOD_SECONDS = envInt(
	"UPPITY_DEFAULT_PUSH_GRACE_PERIOD_SECONDS",
	60,
);

/** Length of the randomly generated token for push monitor endpoints. */
export const PUSH_TOKEN_LENGTH = 32;

/** Days before SSL certificate expiry to trigger a warning notification. */
export const DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS = envInt(
	"UPPITY_DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS",
	14,
);

/** HTTP method used when creating a new HTTP monitor. */
export const DEFAULT_HTTP_METHOD = "GET" as const;

/** Status codes considered successful when creating a new HTTP monitor. */
export const DEFAULT_EXPECTED_STATUS_CODES = [200] as const;

/** Response time above which a successful check is marked as degraded instead of up. */
export const DEGRADED_RESPONSE_TIME_MS = envInt("UPPITY_DEGRADED_RESPONSE_TIME_MS", 5000);

/** Timeout for fetching SSL certificate information from a server. */
export const SSL_INFO_TIMEOUT_MS = envInt("UPPITY_SSL_INFO_TIMEOUT_MS", 5000);

/** Wait time between retry attempts after a failed check. */
export const RETRY_DELAY_MS = envInt("UPPITY_RETRY_DELAY_MS", 1000);

/** Fallback port for HTTPS connections when not specified in the URL. */
export const DEFAULT_HTTPS_PORT = 443;

/** Port number that indicates SMTP should use TLS encryption. */
export const DEFAULT_SMTP_SECURE_PORT = 465;

/** HTTP User-Agent header sent with all outgoing monitor check requests. */
export const USER_AGENT = "Uppity/1.0 (Uptime Monitor)";

/** Brand color used on public status pages when none is configured. */
export const DEFAULT_PRIMARY_COLOR = "#000000";

/** Number of days of uptime history displayed on public status pages. */
export const STATUS_PAGE_HISTORY_DAYS = envInt("UPPITY_STATUS_PAGE_HISTORY_DAYS", 90);

/** Initial status assigned to newly created incidents. */
export const DEFAULT_INCIDENT_STATUS = "investigating" as const;

/** Initial impact level assigned to newly created incidents. */
export const DEFAULT_INCIDENT_IMPACT = "minor" as const;

/** Update message added when an incident is automatically resolved by monitor recovery. */
export const AUTO_RESOLVE_MESSAGE = "Monitor has recovered automatically.";

/** HTTP method used when sending webhook notifications. */
export const DEFAULT_WEBHOOK_METHOD = "POST" as const;

/** Sender address for outgoing email notifications. */
export const DEFAULT_EMAIL_FROM = Bun.env.UPPITY_EMAIL_FROM || "Uppity <noreply@uppity.app>";

/** Number of recent items shown on admin dashboard widgets. */
export const DEFAULT_RECENT_ITEMS_LIMIT = 5;

/** Default page size for paginated lists in the admin interface. */
export const DEFAULT_LIST_LIMIT = envInt("UPPITY_DEFAULT_LIST_LIMIT", 50);

/** Maximum allowed page size for paginated lists to prevent abuse. */
export const MAX_LIST_LIMIT = 100;
