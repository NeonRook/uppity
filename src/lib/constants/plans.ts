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
 * Plan ids whose monitor ceiling is extended by purchased capacity blocks.
 *
 * Uppity is the only plan sold by capacity. Free has no billing relationship, and
 * Dedicated's 2,000 is a fair-use figure on isolated infrastructure rather than a
 * metered allowance. Enterprise is Dedicated plus an SLA, support, onboarding and
 * invoicing — zero feature unlocks — so it carries Dedicated's ceiling and is out of
 * the capacity calculus for the same reason.
 *
 * Blocks stored against an ineligible plan are inert rather than an error, so a plan
 * change never requires a cleanup pass over the column.
 *
 * This set also decides who is *billed* for blocks: `collectBlockSnapshots` reports only
 * these plans to the `monitor_blocks` meter, because only these products carry the
 * metered price that reads it. Extending the set without stacking that price on the new
 * plan's product would raise a ceiling nobody pays for.
 */
export const BLOCK_ELIGIBLE_PLAN_IDS: ReadonlySet<PlanId> = new Set<PlanId>(["uppity"]);

/**
 * Resolves a plan's effective limits for an organization holding `blocks` purchased
 * capacity blocks.
 *
 * The monitor ceiling is the only limit blocks move, to the plan's included allowance
 * plus `MONITOR_BLOCK_SIZE × blocks` — 50 + 50 × blocks on today's Uppity, though the
 * two 50s are independent numbers and only the second is the block size. Everything
 * else is copied through untouched.
 *
 * Two guards keep the arithmetic honest. `-1` is the unlimited sentinel, not a count —
 * adding to it would turn "unlimited" into 49. And a negative `blocks` would shrink the
 * ceiling below the allowance the customer already paid for, so it clamps to zero; the
 * `subscription_blocks_non_negative` constraint should make that unreachable, but the
 * failure is silent enough to be worth defending twice.
 *
 * Returns a fresh object in every branch so callers never hold a reference to a
 * module-level plan constant. The copy is shallow: `notificationChannels` is still the
 * shared array, and callers that need to own it copy it themselves (see
 * `getUsageLimitsData`).
 */
export function applyCapacityBlocks(plan: Plan, blocks: number): PlanLimits {
	const { limits } = plan;

	if (!BLOCK_ELIGIBLE_PLAN_IDS.has(plan.id) || limits.monitors === -1) {
		return { ...limits };
	}

	return { ...limits, monitors: limits.monitors + MONITOR_BLOCK_SIZE * Math.max(0, blocks) };
}

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
