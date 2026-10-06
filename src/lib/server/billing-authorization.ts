/**
 * Server-side authorization for Polar's better-auth endpoints that act on an organization.
 *
 * The plugin checks only that a user is signed in. Its checkout takes the organization
 * from the request and Polar echoes it back on every subscription webhook, which is how
 * a subscription lands on an organization. Left unchecked, anyone signed in could attach
 * a subscription to any organization and replace its billing.
 */

type CanManageBilling = (organizationId: string, userId: string) => Promise<boolean>;

export interface BillingRequest {
	path: string;
	userId: string | undefined;
	body?: unknown;
	query?: unknown;
}

/** Endpoint paths this module decides on. Everything else passes through. */
export const BILLING_PATHS: ReadonlySet<string> = new Set([
	"/checkout",
	"/customer/subscriptions/list",
]);

function field(source: unknown, key: string): unknown {
	return typeof source === "object" && source !== null ? Reflect.get(source, key) : undefined;
}

/**
 * Why the request must be refused, or null when it may proceed. Only owners and admins
 * of the referenced organization may check out for it or read its subscriptions.
 */
export async function refuseBillingRequest(
	request: BillingRequest,
	canManageBilling: CanManageBilling,
): Promise<string | null> {
	if (request.path === "/checkout") {
		// The organization reaches Polar through `reference_id` or a raw `metadata.referenceId`,
		// and `organization_id` selects the plugin's own team billing, which this app does
		// not use. Only the first is checked below, so the other two are refused outright.
		if (field(request.body, "organization_id") !== undefined) {
			return "Checkout by organization_id is not supported";
		}
		if (field(field(request.body, "metadata"), "referenceId") !== undefined) {
			return "Set the organization with reference_id";
		}

		const organizationId = field(request.body, "reference_id");
		if (typeof organizationId !== "string" || organizationId === "") {
			return "A checkout needs an organization";
		}
		return await refuseUnlessManager(organizationId, request.userId, canManageBilling);
	}

	if (request.path === "/customer/subscriptions/list") {
		const organizationId = field(request.query, "reference_id");
		if (organizationId === undefined) return null;
		if (typeof organizationId !== "string") return "Invalid organization";
		return await refuseUnlessManager(organizationId, request.userId, canManageBilling);
	}

	return null;
}

async function refuseUnlessManager(
	organizationId: string,
	userId: string | undefined,
	canManageBilling: CanManageBilling,
): Promise<string | null> {
	if (!userId) return "You must be signed in";
	if (!(await canManageBilling(organizationId, userId))) {
		return "Only owners and admins can manage billing for this organization";
	}
	return null;
}
