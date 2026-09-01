import { describe, expect, it } from "vitest";

import { subscriptionFromCheckout } from "./polar-subscription";

describe("subscriptionFromCheckout", () => {
	const orgId = "org_1";

	it("returns the subscription when the checkout belongs to the organization", () => {
		const result = subscriptionFromCheckout(
			{ subscriptionId: "sub_1", metadata: { referenceId: orgId } },
			orgId,
		);
		expect(result).toBe("sub_1");
	});

	it("returns null before Polar has attached a subscription", () => {
		const result = subscriptionFromCheckout(
			{ subscriptionId: null, metadata: { referenceId: orgId } },
			orgId,
		);
		expect(result).toBeNull();
	});

	it("returns null when the checkout was started for a different organization", () => {
		const result = subscriptionFromCheckout(
			{ subscriptionId: "sub_1", metadata: { referenceId: "org_2" } },
			orgId,
		);
		expect(result).toBeNull();
	});

	it("returns null when the checkout carries no organization reference", () => {
		const result = subscriptionFromCheckout({ subscriptionId: "sub_1", metadata: {} }, orgId);
		expect(result).toBeNull();
	});
});
