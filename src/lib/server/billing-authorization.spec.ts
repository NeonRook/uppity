import { describe, expect, it, vi } from "vitest";

import { refuseBillingRequest } from "./billing-authorization";

const MANAGED = "org-managed";
const canManageBilling = vi.fn(async (organizationId: string, userId: string) => {
	return organizationId === MANAGED && userId === "manager";
});

/** `userId: null` stands for no session; the default is a manager of `MANAGED`. */
function checkout(body: Record<string, unknown>, userId: string | null = "manager") {
	return refuseBillingRequest(
		{ path: "/checkout", userId: userId ?? undefined, body },
		canManageBilling,
	);
}

function listSubscriptions(query: Record<string, unknown>) {
	return refuseBillingRequest(
		{ path: "/customer/subscriptions/list", userId: "manager", query },
		canManageBilling,
	);
}

describe("refuseBillingRequest", () => {
	it("lets an owner or admin check out for their organization", async () => {
		expect(await checkout({ slug: "uppity-monthly", reference_id: MANAGED })).toBeNull();
	});

	it("refuses a checkout for an organization the user does not manage", async () => {
		expect(await checkout({ slug: "uppity-monthly", reference_id: "org-other" })).toMatch(
			/owners and admins/,
		);
		expect(await checkout({ slug: "uppity-monthly", reference_id: MANAGED }, "member")).toMatch(
			/owners and admins/,
		);
	});

	it("refuses a checkout with no organization or no session", async () => {
		expect(await checkout({ slug: "uppity-monthly" })).not.toBeNull();
		expect(await checkout({ slug: "uppity-monthly", reference_id: "" })).not.toBeNull();
		expect(await checkout({ slug: "uppity-monthly", reference_id: MANAGED }, null)).toMatch(
			/signed in/,
		);
	});

	it("refuses an organization smuggled in through metadata", async () => {
		// The plugin forwards metadata unchanged when reference_id is absent, and the
		// webhook reads metadata.referenceId, so this would bypass the reference_id check.
		expect(
			await checkout({ slug: "uppity-monthly", metadata: { referenceId: "org-other" } }),
		).not.toBeNull();
		expect(
			await checkout({
				slug: "uppity-monthly",
				reference_id: MANAGED,
				metadata: { referenceId: "org-other" },
			}),
		).not.toBeNull();
	});

	it("refuses the plugin's organization_id billing", async () => {
		expect(
			await checkout({ slug: "uppity-monthly", reference_id: MANAGED, organization_id: MANAGED }),
		).not.toBeNull();
	});

	it("gates listing an organization's subscriptions the same way", async () => {
		expect(await listSubscriptions({ reference_id: MANAGED })).toBeNull();
		expect(await listSubscriptions({ reference_id: "org-other" })).not.toBeNull();
		// Without reference_id the plugin lists only the caller's own subscriptions.
		expect(await listSubscriptions({})).toBeNull();
	});

	it("leaves other endpoints alone", async () => {
		expect(
			await refuseBillingRequest(
				{ path: "/sign-in/email", userId: undefined, body: { reference_id: "org-other" } },
				canManageBilling,
			),
		).toBeNull();
	});
});
