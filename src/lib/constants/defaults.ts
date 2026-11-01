import { envInt, envString } from "#lib/utils.js";

import { isSelfHosted } from "./plans";

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

/**
 * Cooldown between SSL expiry warning notifications for the same monitor.
 * Without this, a monitor checking every 60s would enqueue 1,440 warnings/day
 * while the cert is inside the threshold.
 */
export const SSL_WARNING_COOLDOWN_HOURS = envInt("UPPITY_SSL_WARNING_COOLDOWN_HOURS", 24);

/**
 * Up and down alerts within FLAP_WINDOW_SECONDS at which a monitor's next outage counts as
 * flapping and holds its alerts. Below 2 turns flap detection off.
 */
export const FLAP_THRESHOLD = envInt("UPPITY_FLAP_THRESHOLD", 5);

/** How far back flapping alerts count, and the time between reminders while a monitor flaps. */
export const FLAP_WINDOW_SECONDS = envInt("UPPITY_FLAP_WINDOW_SECONDS", 3600);

/** How long a flapping monitor must hold one status before it alerts that status. */
export const FLAP_SETTLE_SECONDS = envInt("UPPITY_FLAP_SETTLE_SECONDS", 300);

/** Cooldown between repeats of one operator alert while its cause lasts. */
export const OPS_ALERT_COOLDOWN_HOURS = envInt("UPPITY_OPS_ALERT_COOLDOWN_HOURS", 6);

/** HTTP method used when creating a new HTTP monitor. */
export const DEFAULT_HTTP_METHOD = "GET" as const;

/** Status codes considered successful when creating a new HTTP monitor. */
export const DEFAULT_EXPECTED_STATUS_CODES = [200] as const;

/** Response time above which a successful check is marked as degraded instead of up. */
export const DEGRADED_RESPONSE_TIME_MS = envInt("UPPITY_DEGRADED_RESPONSE_TIME_MS", 5000);

/** Wait time between retry attempts after a failed check. */
export const RETRY_DELAY_MS = envInt("UPPITY_RETRY_DELAY_MS", 1000);

/** Port number that indicates SMTP should use TLS encryption. */
export const DEFAULT_SMTP_SECURE_PORT = 465;

/** HTTP User-Agent header sent with all outgoing monitor check requests. */
export const USER_AGENT = "Uppity/1.0 (Uptime Monitor)";

/** Brand color used on public status pages when none is configured. */
export const DEFAULT_PRIMARY_COLOR = "#000000";

/** Day windows the monitor response-time chart offers, each shown only if the plan retains that long. */
export const RESPONSE_HISTORY_WINDOWS = [30, 60, 90];

/** Number of days of uptime history displayed on public status pages. */
export const STATUS_PAGE_HISTORY_DAYS = envInt("UPPITY_STATUS_PAGE_HISTORY_DAYS", 90);

/**
 * Confirmation emails one status page may send in 24 hours: the base, or this percentage
 * of its confirmed subscribers when that is more, never above the max. Visitors type any
 * address into the subscribe form, so this caps how much mail a page can direct at
 * strangers, while a page with a real audience gets room to grow during an outage. The
 * max stops a page from raising its own cap by confirming addresses it controls.
 */
export const SUBSCRIBER_CONFIRMATION_CAP = {
	base: envInt("UPPITY_SUBSCRIBER_CONFIRMATIONS_BASE", 50),
	percentOfConfirmed: envInt("UPPITY_SUBSCRIBER_CONFIRMATIONS_PERCENT", 25),
	max: envInt("UPPITY_SUBSCRIBER_CONFIRMATIONS_MAX", 300),
};

/** Days a suppressed address's subscriptions are kept before deletion. The suppression itself stays. */
export const SUPPRESSED_SUBSCRIBER_RETENTION_DAYS = envInt(
	"UPPITY_SUPPRESSED_SUBSCRIBER_RETENTION_DAYS",
	90,
);

/**
 * Unanswered emails one organization may have sent in the past week: confirmations to email
 * channel addresses and team invitations together. A confirmation or an accepted invitation
 * frees its slot, so a team whose recipients answer never meets the cap, while mail to
 * strangers who ignore it stalls here.
 */
export const CHANNEL_PENDING_CONFIRMATIONS = envInt("UPPITY_CHANNEL_PENDING_CONFIRMATIONS", 5);

/**
 * Emails to addresses that never agreed to mail, across the whole instance, in 24 hours. The
 * per-organization caps don't bound the total because accounts are free. Zero turns it off,
 * the default when self-hosted, where the mail account at risk is the operator's own.
 */
export const UNSOLICITED_MAIL_DAILY_CEILING = envInt(
	"UPPITY_UNSOLICITED_MAIL_DAILY_CEILING",
	isSelfHosted() ? 0 : 1000,
);

/**
 * When an organization's unsolicited mail draws too many failures: at least the minimum count
 * in the window, and at least the rate of its sends. The minimums keep a handful of typos
 * from counting as a rate. The rates are Scaleway's 7% rejection alert and Google's 0.3% spam
 * limit. Complaints are in per mille because envInt reads whole numbers.
 */
export const MAIL_REPUTATION = {
	windowDays: envInt("UPPITY_MAIL_REPUTATION_WINDOW_DAYS", 30),
	bounceMin: envInt("UPPITY_MAIL_BOUNCE_MIN", 10),
	bouncePercent: envInt("UPPITY_MAIL_BOUNCE_PERCENT", 7),
	complaintMin: envInt("UPPITY_MAIL_COMPLAINT_MIN", 3),
	complaintPerMille: envInt("UPPITY_MAIL_COMPLAINT_PER_MILLE", 3),
};

/**
 * Slug of a public status page to feature on the landing page, or empty to
 * omit that section.
 *
 * Only meaningful on the hosted instance, where it points at the page Uppity
 * keeps on itself: the copy around it says so in as many words. A self-hosted
 * instance leaves this unset and gets the link-only section.
 */
export const LANDING_STATUS_PAGE_SLUG = envString("UPPITY_LANDING_STATUS_SLUG", "");

/** Initial status assigned to newly created incidents. */
export const DEFAULT_INCIDENT_STATUS = "investigating" as const;

/** Initial impact level assigned to newly created incidents. */
export const DEFAULT_INCIDENT_IMPACT = "minor" as const;

/** Sender address for outgoing email notifications. */
export const DEFAULT_EMAIL_FROM = envString("UPPITY_EMAIL_FROM", "Uppity <noreply@uppity.cloud>");
