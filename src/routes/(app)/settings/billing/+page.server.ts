import { redirect } from "@sveltejs/kit";

import {
	BLOCK_ELIGIBLE_PLAN_IDS,
	isSelfHosted,
	PLANS,
	PUBLIC_PLAN_IDS,
} from "#lib/constants/plans.js";
import { syncCheckout } from "#lib/server/polar-subscription.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";
import { usageService } from "#lib/server/services/usage.service.js";
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
			capacity: null,
		};
	}

	const checkoutId = url.searchParams.get("checkout_id");
	if (checkoutId) {
		try {
			await syncCheckout(checkoutId, organizationId);
		} catch (error) {
			// The webhook delivers the same subscription; a Polar failure here
			// costs a stale page, not the purchase.
			locals.event.setError(error);
		}
	}

	const [subscription, usageSummary, canManageBilling] = await Promise.all([
		subscriptionService.getOrCreateSubscription(organizationId),
		usageService.getUsageSummary(organizationId),
		subscriptionService.canManageBilling(organizationId, locals.user.id),
	]);

	const sellsBlocks = !selfHosted && BLOCK_ELIGIBLE_PLAN_IDS.has(subscription.planId as PlanId);

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
				current: usageSummary.monitors.currentUsage,
				limit: usageSummary.monitors.limit,
			},
			statusPages: {
				current: usageSummary.statusPages.currentUsage,
				limit: usageSummary.statusPages.limit,
			},
		},
		plans: publicPlans,
		checkoutSuccess,
		organizationId,
		currentPlanName: usageSummary.plan.name,
		capacity: sellsBlocks
			? {
					blocks: subscription.blocks,
					scheduledBlocks: subscription.scheduledBlocks,
					annual: subscription.billingInterval === "year",
					canManage: canManageBilling,
				}
			: null,
	};
};
