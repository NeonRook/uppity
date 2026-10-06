import { getCheckouts } from "@polar-sh/sdk/2026-10/services/checkouts";
import { getSubscriptions } from "@polar-sh/sdk/2026-10/services/subscriptions";

import { getPlanFromSubscription, mapPolarStatus } from "#lib/server/auth.js";
import { polarClient } from "#lib/server/polar.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";
import type { PolarSubscriptionSnapshot } from "#lib/server/services/subscription.service.js";

/**
 * Reads the live subscription from Polar.
 *
 * Lives here rather than in SubscriptionService so the Polar client and the
 * product-id mapping stay together with the rest of the Polar configuration.
 */
export async function fetchPolarSnapshot(
	polarSubscriptionId: string,
): Promise<PolarSubscriptionSnapshot> {
	const sub = await getSubscriptions(polarClient)(polarSubscriptionId);

	return {
		planId: getPlanFromSubscription(sub),
		status: mapPolarStatus(sub.status),
		polarCustomerId: sub.customer_id,
		polarSubscriptionId: sub.id,
		currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start) : undefined,
		currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : undefined,
	};
}

interface CheckoutOutcome {
	subscription_id: string | null;
	metadata: Record<string, unknown>;
}

/**
 * The subscription a completed checkout produced for this organization, or
 * null when there is nothing to apply.
 *
 * The checkout id arrives on the query string, so the organization must be
 * proven by the checkout itself: `referenceId` is the org the checkout was
 * started for, and only that org may receive its subscription.
 */
export function subscriptionFromCheckout(
	checkout: CheckoutOutcome,
	organizationId: string,
): string | null {
	if (!checkout.subscription_id) return null;
	if (checkout.metadata.referenceId !== organizationId) return null;
	return checkout.subscription_id;
}

/**
 * Applies the subscription a checkout produced without waiting for the webhook.
 *
 * Polar redirects the customer back before `subscription.created` is delivered,
 * so the billing page would otherwise render the previous plan until a reload.
 * The webhook still arrives later and writes the same values; both paths end
 * in the same idempotent sync.
 *
 * Returns whether a subscription was applied.
 */
export async function syncCheckout(checkoutId: string, organizationId: string): Promise<boolean> {
	const checkout = await getCheckouts(polarClient)(checkoutId);
	const subscriptionId = subscriptionFromCheckout(checkout, organizationId);
	if (!subscriptionId) return false;

	const snapshot = await fetchPolarSnapshot(subscriptionId);
	await subscriptionService.resyncFromPolar(organizationId, snapshot);
	return true;
}
