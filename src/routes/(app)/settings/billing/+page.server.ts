import { PLANS } from "$lib/constants/plans";
import { subscriptionService, isSelfHosted } from "$lib/server/services/subscription.service";
import { usageService } from "$lib/server/services/usage.service";
import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

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
			plans: Object.values(PLANS),
			checkoutSuccess,
			organizationId: null,
		};
	}

	// Get subscription and usage data
	const [subscription, usageSummary] = await Promise.all([
		subscriptionService.getOrCreateSubscription(organizationId),
		usageService.getUsageSummary(organizationId),
	]);

	return {
		selfHosted,
		subscription: {
			planId: subscription.planId,
			status: subscription.status,
			currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
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
		plans: Object.values(PLANS),
		checkoutSuccess,
		organizationId,
		currentPlanName: usageSummary.plan.name,
	};
};
