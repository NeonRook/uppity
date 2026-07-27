export const AUDIT_ACTIONS = [
	"user.create",
	"user.update",
	"user.ban",
	"user.unban",
	"user.role_change",
	"user.session_revoke",
	"user.sessions_revoke_all",
	"user.impersonate_start",
	"user.impersonate_stop",
	"org.create",
	"org.update",
	"org.delete",
	"org.member_add",
	"org.member_remove",
	"org.subscription_resync",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = [
	"user",
	"organization",
	"member",
	"session",
	"subscription",
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/** Number of audit entries shown per page in the admin list. */
export const AUDIT_PAGE_SIZE = 50;

/** Number of entries shown in the per-entity history and dashboard panels. */
export const AUDIT_PANEL_LIMIT = 10;

/** Upper bound on rows in one CSV export. */
export const AUDIT_EXPORT_LIMIT = 50_000;
