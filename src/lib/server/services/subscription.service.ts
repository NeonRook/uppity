import { ORGANIZATION_MEMBERSHIP_LIMIT } from "$lib/constants/auth";
import {
	applyCapacityBlocks,
	BLOCK_ELIGIBLE_PLAN_IDS,
	DEFAULT_PLAN_ID,
	isSelfHosted,
	PLANS,
	SELF_HOSTED_LIMITS,
} from "$lib/constants/plans";
import { db } from "$lib/server/db";
import { invitation, member } from "$lib/server/db/auth-schema";
import * as schema from "$lib/server/db/schema";
import { subscription, monitor, statusPage, type Subscription } from "$lib/server/db/schema";
import type {
	LimitCheckResult,
	NotificationChannelType,
	Plan,
	PlanId,
	PlanLimits,
	SubscriptionStatus,
} from "$lib/types/plans";
import { and, count, eq, gt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";

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
	| { ok: false; reason: "over_capacity"; currentUsage: number; limit: number };

/** A subscription as read live from the Polar API, normalized to our plan ids. */
export interface PolarSubscriptionSnapshot {
	planId: PlanId;
	status: SubscriptionStatus;
	polarCustomerId?: string;
	polarSubscriptionId?: string;
	currentPeriodStart?: Date;
	currentPeriodEnd?: Date;
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
	 * Sets an organization's purchased capacity blocks, refusing a reduction that would
	 * leave the organization over the resulting monitor ceiling.
	 *
	 * A successful write must be followed by `MeterService.reportBlocks`;
	 * nothing here reaches Polar.
	 */
	async setBlocks(organizationId: string, blocks: number): Promise<SetBlocksResult> {
		if (!Number.isInteger(blocks) || blocks < 0) {
			return { ok: false, reason: "invalid_count" };
		}

		const sub = await this.getOrCreateSubscription(organizationId);
		const plan = getPlanById(sub.planId as PlanId);
		if (!plan || !BLOCK_ELIGIBLE_PLAN_IDS.has(plan.id)) {
			return { ok: false, reason: "plan_ineligible" };
		}

		if (blocks < sub.blocks) {
			const { monitors: limit } = applyCapacityBlocks(plan, blocks);
			const usage = await this.getUsage(organizationId);
			if (limit !== -1 && usage.monitors > limit) {
				return { ok: false, reason: "over_capacity", currentUsage: usage.monitors, limit };
			}
		}

		const [updated] = await this.db
			.update(subscription)
			.set({ blocks, updatedAt: new Date() })
			.where(eq(subscription.organizationId, organizationId))
			.returning();

		return { ok: true, subscription: updated };
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
	 * the count. It is only ever cleared here, when the plan leaves block eligibility.
	 */
	async syncFromPolar(
		organizationId: string,
		data: {
			planId: PlanId;
			status: SubscriptionStatus;
			polarCustomerId?: string;
			polarSubscriptionId?: string;
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

			const [updated] = await this.db
				.update(subscription)
				.set({
					planId: data.planId,
					status: data.status,
					blocks: leavingBlockEligibility ? 0 : existing.blocks,
					polarCustomerId: data.polarCustomerId ?? existing.polarCustomerId,
					polarSubscriptionId: data.polarSubscriptionId ?? existing.polarSubscriptionId,
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
	 * Free is not block-eligible, so `syncFromPolar` clears the purchased count as part
	 * of the same write. This needs no clearing of its own.
	 */
	async downgradeToFree(organizationId: string): Promise<Subscription> {
		return this.syncFromPolar(organizationId, {
			planId: "free",
			status: "active",
		});
	}
}

export const subscriptionService = new SubscriptionService(db);
