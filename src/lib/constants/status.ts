/** Possible health states for a monitor after a check is performed. */
export const MONITOR_STATUSES = ["up", "down", "degraded", "unknown"] as const;
export type MonitorStatus = (typeof MONITOR_STATUSES)[number];

/** Supported protocols for health check monitors. */
export const MONITOR_TYPES = ["http", "tcp", "push"] as const;
export type MonitorType = (typeof MONITOR_TYPES)[number];

/** Lifecycle states an incident can be in, including post-resolution. */
export const INCIDENT_STATUSES = [
	"investigating",
	"identified",
	"monitoring",
	"resolved",
	"postmortem",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Incident states selectable in forms (postmortem is added via separate action). */
export const INCIDENT_STATUS_VALUES = [
	"investigating",
	"identified",
	"monitoring",
	"resolved",
] as const;
export type IncidentStatusValue = (typeof INCIDENT_STATUS_VALUES)[number];

/** Severity levels indicating how much an incident affects service availability. */
export const INCIDENT_IMPACTS = ["none", "minor", "major", "critical"] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

/** Aggregated health states shown at the top of public status pages. */
export const PAGE_STATUSES = ["operational", "degraded", "partial_outage", "major_outage"] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

/** Per-day health summary states used in the status page history timeline. */
export const DAILY_HISTORY_STATUSES = ["up", "down", "degraded", "partial"] as const;
export type DailyHistoryStatus = (typeof DAILY_HISTORY_STATUSES)[number];

/** Delivery outcomes for notification attempts. */
export const NOTIFICATION_LOG_STATUSES = ["sent", "failed"] as const;
export type NotificationLogStatus = (typeof NOTIFICATION_LOG_STATUSES)[number];

/** Events that can trigger a notification to be sent. */
export const NOTIFICATION_TYPES = [
	"monitor_down",
	"monitor_up",
	"monitor_degraded",
	"ssl_expiry_warning",
	"incident_created",
	"incident_updated",
	"incident_resolved",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
