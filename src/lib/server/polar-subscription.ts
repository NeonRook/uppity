import { getPlanFromSubscription, mapPolarStatus } from "$lib/server/auth";
import { polarClient } from "$lib/server/polar";
import {
	subscriptionService,
	type PolarSubscriptionSnapshot,
} from "$lib/server/services/subscription.service";

/**
 * Reads the live subscription from Polar.
 *
 * Lives here rather than in SubscriptionService so the Polar client and the
 * product-id mapping stay together with the rest of the Polar configuration.
 */
export async function fetchPolarSnapshot(
	polarSubscriptionId: string,
): Promise<PolarSubscriptionSnapshot> {
	const sub = await polarClient.subscriptions.get({ id: polarSubscriptionId });

	return {
		planId: getPlanFromSubscription(sub),
		status: mapPolarStatus(sub.status),
		polarCustomerId: sub.customerId,
		polarSubscriptionId: sub.id,
		currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : undefined,
		currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined,
	};
}

interface CheckoutOutcome {
	subscriptionId: string | null;
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
	if (!checkout.subscriptionId) return null;
	if (checkout.metadata.referenceId !== organizationId) return null;
	return checkout.subscriptionId;
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
	const checkout = await polarClient.checkouts.get({ id: checkoutId });
	const subscriptionId = subscriptionFromCheckout(checkout, organizationId);
	if (!subscriptionId) return false;

	const snapshot = await fetchPolarSnapshot(subscriptionId);
	await subscriptionService.resyncFromPolar(organizationId, snapshot);
	return true;
}
