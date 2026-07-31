/**
 * Notification channel types available in the system.
 */
export type NotificationChannelType = "email" | "slack" | "discord" | "webhook";

/**
 * API access levels for different subscription tiers.
 */
export type ApiAccessLevel = "none" | "read" | "full";

/**
 * Plan identifiers for subscription tiers.
 *
 * `enterprise` is `dedicated` plus a contractual SLA, priority support, onboarding
 * and invoicing. It deliberately unlocks no additional features — see PRODUCT.md.
 */
export type PlanId = "free" | "uppity" | "dedicated" | "enterprise";

/**
 * Subscription status values.
 */
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing";

/**
 * Defines the limits and features available for a subscription plan.
 * A value of -1 indicates unlimited for numeric limits.
 */
export interface PlanLimits {
	/** Maximum number of monitors allowed. -1 for unlimited. */
	monitors: number;

	/** Minimum check interval in seconds. Lower is better (more frequent checks). */
	checkIntervalSeconds: number;

	/** Maximum number of status pages allowed. -1 for unlimited. */
	statusPages: number;

	/**
	 * Number of days to retain check history data. -1 for unlimited.
	 *
	 * Enforced by `cleanupOldChecks` in `src/worker/monitor/stats.ts`, which runs one
	 * DELETE per distinct retention window. -1 resolves to the operator's
	 * `UPPITY_CHECK_RETENTION_DAYS` rather than to infinity — see `retentionGroups`.
	 */
	retentionDays: number;

	/**
	 * Maximum number of members in the organization. -1 for unlimited.
	 *
	 * Enforced through better-auth's `membershipLimit` function and the
	 * `beforeCreateInvitation` hook in `src/lib/server/auth.ts`, both backed by
	 * `SubscriptionService.getMemberCapacity`. Counts accepted members plus unexpired
	 * pending invitations. -1 resolves to `UPPITY_ORGANIZATION_MEMBERSHIP_LIMIT`.
	 */
	teamMembers: number;

	/** Notification channel types available to this plan. */
	notificationChannels: NotificationChannelType[];

	/** Whether custom domains are allowed for status pages. */
	customDomains: boolean;

	/** API access level for this plan. */
	apiAccess: ApiAccessLevel;

	/** Whether SSO/SAML authentication is available. */
	sso: boolean;

	/** Whether audit logs are available. */
	auditLogs: boolean;
}

/**
 * Complete plan definition including pricing and limits.
 */
export interface Plan {
	id: PlanId;
	name: string;
	/** Monthly price in cents. null for custom pricing (enterprise). */
	monthlyPriceCents: number | null;
	/** Annual price in cents. null for custom pricing (enterprise). */
	annualPriceCents: number | null;
	limits: PlanLimits;
}

/**
 * Resource types that can be limited by subscription plans.
 */
export type LimitedResource = "monitors" | "statusPages" | "checkInterval" | "notificationChannel";

/**
 * Result of checking a limit before an action.
 */
export interface LimitCheckResult {
	allowed: boolean;
	currentUsage?: number;
	limit?: number;
	message?: string;
}
