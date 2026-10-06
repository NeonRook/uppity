import { and, count, eq, gt, inArray, isNotNull, lte, ne, sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";

import { ORGANIZATION_MEMBERSHIP_LIMIT } from "#lib/constants/auth.js";
import {
	applyCapacityBlocks,
	BLOCK_ELIGIBLE_PLAN_IDS,
	DEFAULT_PLAN_ID,
	MAX_MONITOR_BLOCKS,
	isSelfHosted,
	PLANS,
	SELF_HOSTED_LIMITS,
} from "#lib/constants/plans.js";
import { invitation, member, organization } from "#lib/server/db/auth-schema.js";
import * as schema from "#lib/server/db/schema.js";
import { subscription, monitor, statusPage, type Subscription } from "#lib/server/db/schema.js";
import type {
	BillingInterval,
	LimitCheckResult,
	NotificationChannelType,
	Plan,
	PlanId,
	PlanLimits,
	SubscriptionStatus,
} from "#lib/types/plans.js";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Gets a plan definition by ID.
 */
export function getPlanById(planId: PlanId): Plan | undefined {
	return PLANS[planId];
}

/** Outcome of a capacity-block change. */
export type SetBlocksResult =
	| { ok: true; subscription: Subscription }
	| { ok: false; reason: "plan_ineligible" }
	| { ok: false; reason: "invalid_count" }
	| { ok: false; reason: "above_max"; max: number }
	| { ok: false; reason: "multi_org_customer"; organization: { id: string; name: string } };

/** Roles allowed to change what an organization is billed for. */
const BILLING_ROLES: ReadonlySet<string> = new Set(["owner", "admin"]);

/** A subscription as read live from the Polar API, normalized to our plan ids. */
export interface PolarSubscriptionSnapshot {
	planId: PlanId;
	status: SubscriptionStatus;
	polarCustomerId?: string;
	polarSubscriptionId?: string;
	billingInterval?: BillingInterval;
	currentPeriodStart?: Date;
	currentPeriodEnd?: Date;
}

/**
 * Slack allowed between a stored period end and the next period's start. A missed roll
 * is never repaired: the renewal webhook has already moved `currentPeriodEnd` forward, so
 * the sweep never sees the reduction as due either.
 */
const PERIOD_BOUNDARY_TOLERANCE_MS = 60_000;

/**
 * Whether a Polar sync carries the subscription into a new billing period, which is
 * when a scheduled reduction lands.
 */
function periodRolled(
	existing: Pick<Subscription, "currentPeriodStart" | "currentPeriodEnd">,
	incoming: { currentPeriodStart?: Date; currentPeriodEnd?: Date },
): boolean {
	if (incoming.currentPeriodEnd == null || incoming.currentPeriodStart == null) return false;
	if (
		existing.currentPeriodEnd != null &&
		incoming.currentPeriodStart.getTime() >=
			existing.currentPeriodEnd.getTime() - PERIOD_BOUNDARY_TOLERANCE_MS
	) {
		return true;
	}
	return false;
}

export class SubscriptionService {
	private db: Db;

	constructor(database: Db) {
		this.db = database;
	}

	/**
	 * Gets or creates a subscription for an organization.
	 * New organizations start on the free plan.
	 */
	async getOrCreateSubscription(organizationId: string): Promise<Subscription> {
		const existing = await this.getSubscription(organizationId);
		if (existing) {
			return existing;
		}

		// Create a new free subscription
		const [newSubscription] = await this.db
			.insert(subscription)
			.values({
				id: nanoid(),
				organizationId,
				planId: DEFAULT_PLAN_ID,
				status: "active",
			})
			.returning();

		return newSubscription;
	}

	/**
	 * Gets the subscription for an organization.
	 */
	async getSubscription(organizationId: string): Promise<Subscription | null> {
		const [result] = await this.db
			.select()
			.from(subscription)
			.where(eq(subscription.organizationId, organizationId))
			.limit(1);

		return result || null;
	}

	/**
	 * Gets the effective plan limits for an organization.
	 *
	 * Returns self-hosted limits if in self-hosted mode. Otherwise resolves the plan
	 * and layers the organization's purchased capacity blocks on top, so every caller
	 * — monitor creation caps included — sees the ceiling the customer actually paid
	 * for rather than the plan's included allowance.
	 */
	async getEffectiveLimits(organizationId: string): Promise<PlanLimits> {
		if (isSelfHosted()) {
			return SELF_HOSTED_LIMITS;
		}

		const sub = await this.getOrCreateSubscription(organizationId);
		// Fall back to the free plan if the stored id is one we no longer ship.
		const plan = getPlanById(sub.planId as PlanId) ?? PLANS[DEFAULT_PLAN_ID];

		return applyCapacityBlocks(plan, sub.blocks);
	}

	/**
	 * Sets an organization's purchased capacity blocks.
	 *
	 * An increase applies immediately and drops any scheduled reduction. A reduction is
	 * scheduled for the end of the billing period instead, because the meter bills the
	 * period's peak whatever happens after it; `docs/adr/0004` records why. Asking for
	 * the count already held cancels a scheduled reduction. A subscription with no known
	 * period end has no date to schedule against, so a reduction there applies immediately.
	 *
	 * A successful write must be followed by `MeterService.reportBlocks`;
	 * nothing here reaches Polar.
	 */
	async setBlocks(organizationId: string, blocks: number): Promise<SetBlocksResult> {
		if (!Number.isInteger(blocks) || blocks < 0) {
			return { ok: false, reason: "invalid_count" };
		}
		if (blocks > MAX_MONITOR_BLOCKS) {
			return { ok: false, reason: "above_max", max: MAX_MONITOR_BLOCKS };
		}

		const sub = await this.getOrCreateSubscription(organizationId);
		const plan = getPlanById(sub.planId as PlanId);
		if (!plan || !BLOCK_ELIGIBLE_PLAN_IDS.has(plan.id)) {
			return { ok: false, reason: "plan_ineligible" };
		}

		// Polar scopes the meter to the customer, so blocks held in a second organization
		// are charged on both subscriptions. Reductions stay allowed: refusing them would
		// only keep a double charge in place.
		if (blocks > sub.blocks) {
			const holder = await this.otherBlockHolder(sub);
			if (holder !== null) {
				return { ok: false, reason: "multi_org_customer", organization: holder };
			}
		}

		// Without a period end nothing would ever apply the reduction, so it lands now.
		const schedule = blocks < sub.blocks && sub.currentPeriodEnd !== null;
		const change = schedule ? { scheduledBlocks: blocks } : { blocks, scheduledBlocks: null };

		const [updated] = await this.db
			.update(subscription)
			.set({ ...change, updatedAt: new Date() })
			.where(eq(subscription.organizationId, organizationId))
			.returning();

		return { ok: true, subscription: updated };
	}

	/**
	 * Another organization where this subscription's Polar customer holds blocks. The
	 * caller may not belong to it; check `memberRole` before showing its name.
	 */
	private async otherBlockHolder(sub: Subscription): Promise<{ id: string; name: string } | null> {
		if (!sub.polarCustomerId) return null;

		const [other] = await this.db
			.select({ id: organization.id, name: organization.name })
			.from(subscription)
			.innerJoin(organization, eq(organization.id, subscription.organizationId))
			.where(
				and(
					eq(subscription.polarCustomerId, sub.polarCustomerId),
					ne(subscription.organizationId, sub.organizationId),
					inArray(subscription.planId, [...BLOCK_ELIGIBLE_PLAN_IDS]),
					gt(subscription.blocks, 0),
				),
			)
			.limit(1);

		return other ?? null;
	}

	/** The user's role in the organization, or null when they are not a member. */
	async memberRole(organizationId: string, userId: string): Promise<string | null> {
		const [row] = await this.db
			.select({ role: member.role })
			.from(member)
			.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
			.limit(1);

		return row?.role ?? null;
	}

	/**
	 * Whether a Polar subscription is the one this organization is billed through. Webhooks
	 * for any other subscription carrying the organization's reference must not change it:
	 * a stray subscription's cancellation would otherwise downgrade an organization whose
	 * real subscription is still being paid.
	 *
	 * Rows written before the subscription id was stored fall back to the customer.
	 */
	async holdsPolarSubscription(
		organizationId: string,
		polarSubscriptionId: string,
		polarCustomerId: string,
	): Promise<boolean> {
		const sub = await this.getSubscription(organizationId);
		if (!sub) return false;
		if (sub.polarSubscriptionId !== null) return sub.polarSubscriptionId === polarSubscriptionId;
		return sub.polarCustomerId === polarCustomerId;
	}

	/** Whether the user may change what the organization is billed for. */
	async canManageBilling(organizationId: string, userId: string): Promise<boolean> {
		const role = await this.memberRole(organizationId, userId);
		return role !== null && BILLING_ROLES.has(role);
	}

	/**
	 * Applies every scheduled reduction whose billing period has ended.
	 *
	 * The renewal webhook normally applies these through `syncFromPolar`; this catches
	 * the ones whose webhook never arrived. It must run before `MeterService.reportBlocks`
	 * in the same pass, or the new period meters the old peak and the reduction costs the
	 * customer another full period.
	 *
	 * Organizations that have outgrown the smaller ceiling are reduced anyway. Enforcement
	 * only refuses new monitors, so they keep what they have.
	 */
	async applyScheduledReductions(at?: Date): Promise<number> {
		const applied = await this.db
			.update(subscription)
			.set({
				blocks: sql`${subscription.scheduledBlocks}`,
				scheduledBlocks: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					isNotNull(subscription.scheduledBlocks),
					lte(subscription.currentPeriodEnd, at ?? new Date()),
				),
			)
			.returning({ id: subscription.id });

		return applied.length;
	}

	/**
	 * Gets the current plan for an organization.
	 */
	async getOrganizationPlan(organizationId: string): Promise<Plan> {
		if (isSelfHosted()) {
			// Self-hosted is not a billing tier. It borrows `dedicated` as its id so
			// UI keyed on plan id treats it as top-tier, but the name is what renders.
			return {
				id: "dedicated" as PlanId,
				name: "Self-Hosted",
				monthlyPriceCents: null,
				annualPriceCents: null,
				limits: SELF_HOSTED_LIMITS,
			};
		}

		const sub = await this.getOrCreateSubscription(organizationId);
		const plan = getPlanById(sub.planId as PlanId);

		return plan ?? PLANS[DEFAULT_PLAN_ID];
	}

	/**
	 * Gets the current usage for an organization.
	 */
	async getUsage(organizationId: string): Promise<{
		monitors: number;
		statusPages: number;
	}> {
		const [monitorCount] = await this.db
			.select({ count: count() })
			.from(monitor)
			.where(eq(monitor.organizationId, organizationId));

		const [statusPageCount] = await this.db
			.select({ count: count() })
			.from(statusPage)
			.where(eq(statusPage.organizationId, organizationId));

		return {
			monitors: monitorCount?.count ?? 0,
			statusPages: statusPageCount?.count ?? 0,
		};
	}

	/**
	 * Reports how much of the organization's team-member allowance is consumed.
	 *
	 * Counts accepted members *and* unexpired pending invitations: counting accepted
	 * members alone would let an organization blow past its cap by mass-inviting.
	 * Expired invitations release their slot.
	 *
	 * A `teamMembers` limit of -1 resolves to `ORGANIZATION_MEMBERSHIP_LIMIT` rather
	 * than infinity, because better-auth compares `membersCount >= limit` and needs a
	 * real number.
	 */
	async getMemberCapacity(organizationId: string): Promise<{
		used: number;
		limit: number;
		canInvite: boolean;
	}> {
		const limits = await this.getEffectiveLimits(organizationId);
		const limit = limits.teamMembers === -1 ? ORGANIZATION_MEMBERSHIP_LIMIT : limits.teamMembers;

		const [memberCount] = await this.db
			.select({ count: count() })
			.from(member)
			.where(eq(member.organizationId, organizationId));

		const [pendingCount] = await this.db
			.select({ count: count() })
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, organizationId),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, new Date()),
				),
			);

		const used = (memberCount?.count ?? 0) + (pendingCount?.count ?? 0);

		return { used, limit, canInvite: used < limit };
	}

	/**
	 * Checks if an organization can add more monitors.
	 */
	async canAddMonitor(organizationId: string): Promise<LimitCheckResult> {
		const limits = await this.getEffectiveLimits(organizationId);

		// -1 means unlimited
		if (limits.monitors === -1) {
			return { allowed: true };
		}

		const usage = await this.getUsage(organizationId);
		const allowed = usage.monitors < limits.monitors;

		return {
			allowed,
			currentUsage: usage.monitors,
			limit: limits.monitors,
			message: allowed
				? undefined
				: `You've reached the limit of ${limits.monitors} monitors on your current plan. Upgrade to add more.`,
		};
	}

	/**
	 * Checks if an organization can add more status pages.
	 */
	async canAddStatusPage(organizationId: string): Promise<LimitCheckResult> {
		const limits = await this.getEffectiveLimits(organizationId);

		// -1 means unlimited
		if (limits.statusPages === -1) {
			return { allowed: true };
		}

		const usage = await this.getUsage(organizationId);
		const allowed = usage.statusPages < limits.statusPages;

		return {
			allowed,
			currentUsage: usage.statusPages,
			limit: limits.statusPages,
			message: allowed
				? undefined
				: `You've reached the limit of ${limits.statusPages} status pages on your current plan. Upgrade to add more.`,
		};
	}

	/**
	 * Checks if a check interval is allowed for an organization's plan.
	 */
	async isCheckIntervalAllowed(
		organizationId: string,
		intervalSeconds: number,
	): Promise<LimitCheckResult> {
		const limits = await this.getEffectiveLimits(organizationId);
		const allowed = intervalSeconds >= limits.checkIntervalSeconds;

		return {
			allowed,
			limit: limits.checkIntervalSeconds,
			message: allowed
				? undefined
				: `Check intervals below ${limits.checkIntervalSeconds} seconds require a higher plan.`,
		};
	}

	/**
	 * Checks if a notification channel type is available for an organization.
	 */
	async isNotificationChannelAllowed(
		organizationId: string,
		channelType: NotificationChannelType,
	): Promise<LimitCheckResult> {
		const limits = await this.getEffectiveLimits(organizationId);
		const allowed = limits.notificationChannels.includes(channelType);

		return {
			allowed,
			message: allowed
				? undefined
				: `${channelType} notifications are not available on your current plan.`,
		};
	}

	/**
	 * Checks if custom domains are allowed for an organization.
	 */
	async areCustomDomainsAllowed(organizationId: string): Promise<LimitCheckResult> {
		const limits = await this.getEffectiveLimits(organizationId);

		return {
			allowed: limits.customDomains,
			message: limits.customDomains
				? undefined
				: "Custom domains are not available on your current plan.",
		};
	}

	/**
	 * Updates the subscription from Polar webhook data.
	 * Called when receiving Polar webhook events.
	 *
	 * `blocks` is absent from `data` and never read from a payload — Polar does not know
	 * the count. It changes here in two cases only: it is cleared when the plan leaves
	 * block eligibility, and a scheduled reduction lands when the period rolls.
	 */
	async syncFromPolar(
		organizationId: string,
		data: {
			planId: PlanId;
			status: SubscriptionStatus;
			polarCustomerId?: string;
			polarSubscriptionId?: string;
			/** `null` clears it; absent keeps what is stored. */
			billingInterval?: BillingInterval | null;
			currentPeriodStart?: Date;
			currentPeriodEnd?: Date;
		},
	): Promise<Subscription> {
		const existing = await this.getSubscription(organizationId);

		if (existing) {
			// Leaving a block-eligible plan clears the count. Keeping it would let billing
			// re-arm without a purchase: `collectBlockSnapshots` reports any organization
			// whose plan is eligible, so a subscription that moved to Dedicated and later
			// back to Uppity — or one whose revocation webhook was missed and which then
			// resubscribed — would be charged for blocks nobody re-ordered. The customer
			// buys capacity again through `setBlocks`, which is the only path that should
			// ever start a charge.
			const leavingBlockEligibility =
				BLOCK_ELIGIBLE_PLAN_IDS.has(existing.planId as PlanId) &&
				!BLOCK_ELIGIBLE_PLAN_IDS.has(data.planId);

			let blocks: { blocks?: number | SQL; scheduledBlocks?: null } = {};
			if (leavingBlockEligibility) {
				blocks = { blocks: 0, scheduledBlocks: null };
			} else if (existing.scheduledBlocks !== null && periodRolled(existing, data)) {
				// Read from the row being written, not from `existing`: a `setBlocks` landing
				// between the read and this write may have raised the count or cancelled the
				// reduction, and the stale value would overwrite it.
				blocks = {
					blocks: sql`coalesce(${subscription.scheduledBlocks}, ${subscription.blocks})`,
					scheduledBlocks: null,
				};
			}

			const [updated] = await this.db
				.update(subscription)
				.set({
					planId: data.planId,
					status: data.status,
					...blocks,
					polarCustomerId: data.polarCustomerId ?? existing.polarCustomerId,
					polarSubscriptionId: data.polarSubscriptionId ?? existing.polarSubscriptionId,
					billingInterval:
						data.billingInterval === undefined ? existing.billingInterval : data.billingInterval,
					currentPeriodStart: data.currentPeriodStart ?? existing.currentPeriodStart,
					currentPeriodEnd: data.currentPeriodEnd ?? existing.currentPeriodEnd,
					updatedAt: new Date(),
				})
				.where(eq(subscription.organizationId, organizationId))
				.returning();

			return updated;
		}

		// Create new subscription record
		const [newSub] = await this.db
			.insert(subscription)
			.values({
				id: nanoid(),
				organizationId,
				planId: data.planId,
				status: data.status,
				polarCustomerId: data.polarCustomerId,
				polarSubscriptionId: data.polarSubscriptionId,
				billingInterval: data.billingInterval,
				currentPeriodStart: data.currentPeriodStart,
				currentPeriodEnd: data.currentPeriodEnd,
			})
			.returning();

		return newSub;
	}

	/**
	 * Re-applies a snapshot pulled live from Polar, repairing drift left by a
	 * webhook that never landed.
	 *
	 * Takes an already-fetched snapshot rather than reaching for the Polar SDK
	 * itself: the client and the product-id-to-plan mapping live in auth.ts, and
	 * pulling them in here would drag Polar configuration into a class that is
	 * otherwise pure Drizzle. Polar stays the single source of truth for the plan and
	 * its status — there is deliberately no manual plan override.
	 */
	async resyncFromPolar(
		organizationId: string,
		snapshot: PolarSubscriptionSnapshot,
	): Promise<Subscription> {
		return this.syncFromPolar(organizationId, snapshot);
	}

	/**
	 * Downgrades an organization to the free plan.
	 * Called when a subscription is canceled or payment fails.
	 *
	 * Free is not block-eligible, so `syncFromPolar` clears the purchased count and any
	 * scheduled reduction as part of the same write. This needs no clearing of its own.
	 */
	async downgradeToFree(organizationId: string): Promise<Subscription> {
		return this.syncFromPolar(organizationId, {
			planId: "free",
			status: "active",
			billingInterval: null,
		});
	}
}
