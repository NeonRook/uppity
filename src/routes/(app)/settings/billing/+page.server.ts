import { redirect } from "@sveltejs/kit";

import {
	BLOCK_ELIGIBLE_PLAN_IDS,
	isSelfHosted,
	PLANS,
	PUBLIC_PLAN_IDS,
} from "#lib/constants/plans.js";
import { fetchPolarSnapshot, syncCheckout } from "#lib/server/polar-subscription.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";
import { getUsageLimitsData } from "#lib/server/services/usage-limits.js";
import type { PlanId } from "#lib/types/plans.js";

import type { PageServerLoad } from "./$types";

/** Enterprise is deliberately absent — it is reached via Dedicated's contact flow. */
const publicPlans = PUBLIC_PLAN_IDS.map((id) => PLANS[id]);

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user === null) redirect(302, "/login");

	const selfHosted = isSelfHosted();
	const organizationId = locals.session?.activeOrganizationId;

	// Check for checkout success query param
	const checkoutSuccess = url.searchParams.get("checkout") === "success";

	// If no active organization, return minimal data
	if (!organizationId) {
		return {
			selfHosted,
			subscription: null,
			usage: null,
			plans: publicPlans,
			checkoutSuccess,
			organizationId: null,
			canManageBilling: false,
			capacity: null,
		};
	}

	const canManageBilling = await subscriptionService.canManageBilling(
		organizationId,
		locals.user.id,
	);

	const checkoutId = url.searchParams.get("checkout_id");
	if (checkoutId && canManageBilling) {
		try {
			await syncCheckout(checkoutId, organizationId);
		} catch (error) {
			// The webhook delivers the same subscription; a Polar failure here
			// costs a stale page, not the purchase.
			locals.event.setError(error);
		}
	}

	const [initialSubscription, limitsData] = await Promise.all([
		subscriptionService.getOrCreateSubscription(organizationId),
		getUsageLimitsData(organizationId),
	]);

	let subscription = initialSubscription;
	const sellsBlocks = !selfHosted && BLOCK_ELIGIBLE_PLAN_IDS.has(subscription.planId as PlanId);

	// Subscriptions that predate the interval column have none until Polar next sends a
	// webhook. The card prices and confirms by interval, so fetch it rather than guess.
	if (sellsBlocks && subscription.billingInterval === null && subscription.polarSubscriptionId) {
		try {
			const snapshot = await fetchPolarSnapshot(subscription.polarSubscriptionId);
			subscription = await subscriptionService.resyncFromPolar(organizationId, snapshot);
		} catch (error) {
			locals.event.setError(error);
		}
	}

	return {
		selfHosted,
		subscription: {
			planId: subscription.planId,
			status: subscription.status,
			currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
			hasCustomerAccount: !!subscription.polarCustomerId,
		},
		usage: {
			monitors: {
				current: limitsData.monitors.current,
				limit: limitsData.monitors.limit,
			},
			statusPages: {
				current: limitsData.statusPages.current,
				limit: limitsData.statusPages.limit,
			},
		},
		plans: publicPlans,
		checkoutSuccess,
		organizationId,
		currentPlanName: limitsData.plan.name,
		canManageBilling,
		capacity: sellsBlocks
			? {
					blocks: subscription.blocks,
					scheduledBlocks: subscription.scheduledBlocks,
					// Null when Polar could not be asked; the card refuses changes until known.
					annual:
						subscription.billingInterval === null ? null : subscription.billingInterval === "year",
					canManage: canManageBilling,
				}
			: null,
	};
};
