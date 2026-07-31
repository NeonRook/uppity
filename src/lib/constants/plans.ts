import type { Plan, PlanId, PlanLimits } from "$lib/types/plans";

/**
 * Plan limits for self-hosted instances.
 * All features unlocked, no artificial limits.
 */
export const SELF_HOSTED_LIMITS: PlanLimits = {
	monitors: -1, // Unlimited
	checkIntervalSeconds: 30, // Most frequent available
	statusPages: -1, // Unlimited
	retentionDays: -1, // Unlimited
	teamMembers: -1, // Unlimited
	notificationChannels: ["email", "slack", "discord", "webhook"],
	customDomains: true,
	apiAccess: "full",
	sso: true,
	auditLogs: true,
};

/**
 * Free tier plan configuration.
 *
 * Deliberately generous: the free tier is a positioning claim, not a lead magnet.
 * See PRODUCT.md — competitors gate SSO and audit logs, Uppity does not.
 */
export const FREE_PLAN: Plan = {
	id: "free",
	name: "Free",
	monthlyPriceCents: 0,
	annualPriceCents: 0,
	limits: {
		monitors: 20,
		checkIntervalSeconds: 120, // 2 minutes
		statusPages: 1,
		retentionDays: 30,
		teamMembers: 5,
		notificationChannels: ["email"],
		customDomains: false,
		apiAccess: "read",
		sso: false,
		auditLogs: false,
	},
};

/**
 * Uppity — the base paid unit. $12/month or $120/year (two months free).
 *
 * The 50-monitor allowance is the *included* capacity. Purchasable capacity
 * blocks of +50 monitors are not yet implemented; see PRODUCT.md's outstanding
 * work. Until they are, this ceiling is fixed.
 */
export const UPPITY_PLAN: Plan = {
	id: "uppity",
	name: "Uppity",
	monthlyPriceCents: 1200, // $12/month
	annualPriceCents: 12000, // $120/year (2 months free)
	limits: {
		monitors: 50,
		checkIntervalSeconds: 30,
		statusPages: -1, // Unlimited
		retentionDays: 365, // 1 year
		teamMembers: -1, // Unlimited
		notificationChannels: ["email", "slack", "discord", "webhook"],
		customDomains: true,
		apiAccess: "full",
		sso: true,
		auditLogs: true,
	},
};

/**
 * Dedicated — an isolated instance. $299/month or $2,990/year.
 *
 * Sold on data residency, dedicated infrastructure and compliance, not on price:
 * shared capacity stays cheaper up to roughly 1,845 monitors. The 2,000-monitor
 * figure is fair use, stated as "2,000 monitors at 30-second intervals, or
 * equivalent check volume" — hence a real number rather than -1.
 */
export const DEDICATED_PLAN: Plan = {
	id: "dedicated",
	name: "Dedicated",
	monthlyPriceCents: 29900, // $299/month
	annualPriceCents: 299000, // $2,990/year
	limits: {
		monitors: 2000,
		checkIntervalSeconds: 30,
		statusPages: -1, // Unlimited
		retentionDays: -1, // Unlimited
		teamMembers: -1, // Unlimited
		notificationChannels: ["email", "slack", "discord", "webhook"],
		customDomains: true,
		apiAccess: "full",
		sso: true,
		auditLogs: true,
	},
};

/**
 * Enterprise — Dedicated plus a contractual SLA with service credits, priority
 * support, onboarding and invoicing. Negotiated per customer.
 *
 * Its limits are intentionally identical to Dedicated. Enterprise buys
 * commitments, not features; that is what keeps the "never gate code"
 * positioning claim honest. There is no Polar product and no self-serve path.
 */
export const ENTERPRISE_PLAN: Plan = {
	id: "enterprise",
	name: "Enterprise",
	monthlyPriceCents: null, // Negotiated
	annualPriceCents: null, // Negotiated
	limits: { ...DEDICATED_PLAN.limits },
};

/**
 * All available plans indexed by ID.
 */
export const PLANS: Record<string, Plan> = {
	free: FREE_PLAN,
	uppity: UPPITY_PLAN,
	dedicated: DEDICATED_PLAN,
	enterprise: ENTERPRISE_PLAN,
};

/**
 * Plans rendered in the public billing grid, in display order.
 *
 * Enterprise is excluded: it is reached through the Dedicated card's contact
 * flow, and a card for it would be visually identical to Dedicated's.
 */
export const PUBLIC_PLAN_IDS: PlanId[] = ["free", "uppity", "dedicated"];

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
