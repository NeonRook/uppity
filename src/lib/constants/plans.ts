import type { Plan, PlanLimits } from "$lib/types/plans";

/**
 * Plan limits for self-hosted instances.
 * All features unlocked, no artificial limits.
 */
export const SELF_HOSTED_LIMITS: PlanLimits = {
	monitors: -1, // Unlimited
	checkIntervalSeconds: 30, // Most frequent available
	statusPages: -1, // Unlimited
	retentionDays: -1, // Unlimited
	notificationChannels: ["email", "slack", "discord", "webhook"],
	customDomains: true,
	apiAccess: "full",
	sso: true,
	auditLogs: true,
};

/**
 * Free tier plan configuration.
 */
export const FREE_PLAN: Plan = {
	id: "free",
	name: "Free",
	monthlyPriceCents: 0,
	annualPriceCents: 0,
	limits: {
		monitors: 5,
		checkIntervalSeconds: 300, // 5 minutes
		statusPages: 1,
		retentionDays: 7,
		notificationChannels: ["email"],
		customDomains: false,
		apiAccess: "read",
		sso: false,
		auditLogs: false,
	},
};

/**
 * Pro tier plan configuration.
 */
export const PRO_PLAN: Plan = {
	id: "pro",
	name: "Pro",
	monthlyPriceCents: 1200, // $12/month
	annualPriceCents: 12000, // $120/year (2 months free)
	limits: {
		monitors: 50,
		checkIntervalSeconds: 60, // 1 minute
		statusPages: 5,
		retentionDays: 90,
		notificationChannels: ["email", "slack", "discord", "webhook"],
		customDomains: true,
		apiAccess: "full",
		sso: false,
		auditLogs: false,
	},
};

/**
 * Enterprise tier plan configuration.
 * Custom pricing negotiated per customer.
 */
export const ENTERPRISE_PLAN: Plan = {
	id: "enterprise",
	name: "Enterprise",
	monthlyPriceCents: null, // Custom pricing
	annualPriceCents: null, // Custom pricing
	limits: {
		monitors: -1, // Unlimited
		checkIntervalSeconds: 30, // 30 seconds
		statusPages: -1, // Unlimited
		retentionDays: 365, // 1 year
		notificationChannels: ["email", "slack", "discord", "webhook"],
		customDomains: true,
		apiAccess: "full",
		sso: true,
		auditLogs: true,
	},
};

/**
 * All available plans indexed by ID.
 */
export const PLANS: Record<string, Plan> = {
	free: FREE_PLAN,
	pro: PRO_PLAN,
	enterprise: ENTERPRISE_PLAN,
};

/**
 * Default plan for new organizations.
 */
export const DEFAULT_PLAN_ID = "free" as const;

/**
 * Usage warning thresholds (percentages).
 */
export const USAGE_THRESHOLDS = {
	/** Percentage at which to show a warning. */
	WARNING: 80,
	/** Percentage at which to block the action. */
	LIMIT: 100,
} as const;
