import type {
	LimitCheckResult,
	NotificationChannelType,
	Plan,
	PlanId,
	PlanLimits,
	SubscriptionStatus,
} from "$lib/types/plans";

import { DEFAULT_PLAN_ID, PLANS, SELF_HOSTED_LIMITS } from "$lib/constants/plans";
import { db } from "$lib/server/db";
import { subscription, monitor, statusPage, type Subscription } from "$lib/server/db/schema";
import { eq, count } from "drizzle-orm";
import { nanoid } from "nanoid";

/**
 * Checks if the application is running in self-hosted mode.
 * When true, all subscription limits are bypassed.
 */
export function isSelfHosted(): boolean {
	return process.env.SELF_HOSTED === "true";
}

/**
 * Gets the plan limits for self-hosted mode (all features unlocked).
 */
export function getSelfHostedLimits(): PlanLimits {
	return SELF_HOSTED_LIMITS;
}

/**
 * Gets a plan definition by ID.
 */
export function getPlanById(planId: PlanId): Plan | undefined {
	return PLANS[planId];
}

export class SubscriptionService {
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
		const [newSubscription] = await db
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
		const [result] = await db
			.select()
			.from(subscription)
			.where(eq(subscription.organizationId, organizationId))
			.limit(1);

		return result || null;
	}

	/**
	 * Gets the effective plan limits for an organization.
	 * Returns self-hosted limits if in self-hosted mode, otherwise returns plan limits.
	 */
	async getEffectiveLimits(organizationId: string): Promise<PlanLimits> {
		if (isSelfHosted()) {
			return getSelfHostedLimits();
		}

		const sub = await this.getOrCreateSubscription(organizationId);
		const plan = getPlanById(sub.planId as PlanId);

		// Fall back to free plan limits if plan not found
		return plan?.limits ?? PLANS[DEFAULT_PLAN_ID].limits;
	}

	/**
	 * Gets the current plan for an organization.
	 */
	async getOrganizationPlan(organizationId: string): Promise<Plan> {
		if (isSelfHosted()) {
			// Return a synthetic "self-hosted" plan
			return {
				id: "enterprise" as PlanId,
				name: "Self-Hosted",
				monthlyPriceCents: null,
				annualPriceCents: null,
				limits: getSelfHostedLimits(),
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
		const [monitorCount] = await db
			.select({ count: count() })
			.from(monitor)
			.where(eq(monitor.organizationId, organizationId));

		const [statusPageCount] = await db
			.select({ count: count() })
			.from(statusPage)
			.where(eq(statusPage.organizationId, organizationId));

		return {
			monitors: monitorCount?.count ?? 0,
			statusPages: statusPageCount?.count ?? 0,
		};
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
			const [updated] = await db
				.update(subscription)
				.set({
					planId: data.planId,
					status: data.status,
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
		const [newSub] = await db
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
	 * Downgrades an organization to the free plan.
	 * Called when a subscription is canceled or payment fails.
	 */
	async downgradeToFree(organizationId: string): Promise<Subscription> {
		return this.syncFromPolar(organizationId, {
			planId: "free",
			status: "active",
		});
	}
}

export const subscriptionService = new SubscriptionService();
