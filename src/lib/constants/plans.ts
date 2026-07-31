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
 * Purchasable capacity on top of the Uppity base allowance.
 *
 * Capacity is the one thing with real marginal cost, so it is the one thing
 * metered — see PRODUCT.md's governing principle. A block is safe to price per
 * monitor only because `UPPITY_MIN_INTERVAL_SECONDS` caps worst-case check
 * volume; if that floor ever drops, the billing unit has to change with it.
 */
export const MONITOR_BLOCK_SIZE = 50;
export const MONITOR_BLOCK_PRICE_CENTS = 800; // $8/month per +50 monitors
export const MONITOR_BLOCK_ANNUAL_PRICE_CENTS = 8000; // $80/year (two months free)

/**
 * Uppity — the base paid unit. $12/month or $120/year (two months free).
 *
 * The 50-monitor allowance is the *included* capacity; further capacity is
 * bought in blocks of `MONITOR_BLOCK_SIZE` at `MONITOR_BLOCK_PRICE_CENTS`.
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
 * Checks if the application is running in self-hosted mode.
 * When true, all subscription limits are bypassed.
 *
 * Lives here rather than in `subscription.service.ts` so the monitor worker can
 * ask the question without importing `$lib/server/db`.
 */
export function isSelfHosted(): boolean {
	return process.env.SELF_HOSTED === "true";
}

/** A set of plans that share one effective check-retention window. */
export interface RetentionGroup {
	/** Effective retention window in days. Always finite. */
	days: number;
	/** Plan ids resolving to this window. */
	planIds: PlanId[];
	/**
	 * True for the single group containing `DEFAULT_PLAN_ID`. That group must also
	 * absorb organizations with no subscription row and rows carrying a plan id no
	 * longer present in `PLANS`, so cleanup treats unknown state as free rather
	 * than retaining it forever.
	 */
	catchAll: boolean;
}

/**
 * Groups plans by their effective retention window.
 *
 * `retentionDays: -1` means "no plan-imposed limit" and resolves to `fallbackDays`
 * (the operator's `UPPITY_CHECK_RETENTION_DAYS`) rather than to infinity — otherwise
 * self-hosted and Dedicated instances would never delete a check row.
 *
 * Grouping keeps cleanup at one DELETE per distinct window instead of one per
 * organization. Windows that coincide merge into a single group.
 */
export function retentionGroups(fallbackDays: number): RetentionGroup[] {
	const byDays = new Map<number, PlanId[]>();

	for (const plan of Object.values(PLANS)) {
		const days = plan.limits.retentionDays === -1 ? fallbackDays : plan.limits.retentionDays;
		const existing = byDays.get(days);
		if (existing) existing.push(plan.id);
		else byDays.set(days, [plan.id]);
	}

	return [...byDays.entries()].map(([days, planIds]) => ({
		days,
		planIds,
		catchAll: planIds.includes(DEFAULT_PLAN_ID),
	}));
}

/**
 * Usage warning thresholds (percentages).
 */
export const USAGE_THRESHOLDS = {
	/** Percentage at which to show a warning. */
	WARNING: 80,
	/** Percentage at which to block the action. */
	LIMIT: 100,
} as const;
