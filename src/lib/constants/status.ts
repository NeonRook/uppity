/** Possible health states for a monitor after a check is performed. */
export const MONITOR_STATUSES = ["up", "down", "degraded", "unknown"] as const;
export type MonitorStatus = (typeof MONITOR_STATUSES)[number];

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
