import type { PlanId, SubscriptionStatus } from "$lib/types/plans";

import { getRequestEvent } from "$app/server";
import {
	ORGANIZATION_CREATOR_ROLE,
	ORGANIZATION_LIMIT_PER_USER,
	ORGANIZATION_MEMBERSHIP_LIMIT,
	SESSION_EXPIRES_IN_SECONDS,
	SESSION_UPDATE_AGE_SECONDS,
} from "$lib/constants/auth";
import { db } from "$lib/server/db";
import * as authSchema from "$lib/server/db/auth-schema";
import { subscriptionService } from "$lib/server/services/subscription.service";
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";

// $env/dynamic/private gets baked in at build time by svelte-adapter-bun
// Note: svelte-adapter-bun presents requests as HTTPS, so defaults must use https://
const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL || "https://localhost:3000";
const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") || [
	"https://localhost:3000",
];

const polarClient = new Polar({
	accessToken: process.env.POLAR_ACCESS_TOKEN,
	server: import.meta.env.DEV ? "sandbox" : "production",
});

// Polar product IDs from environment (different for sandbox vs production)
const {
	POLAR_PRODUCT_FREE,
	POLAR_PRODUCT_PRO_MONTHLY,
	POLAR_PRODUCT_PRO_ANNUAL,
	POLAR_PRODUCT_ENTERPRISE,
} = process.env;

/**
 * Maps Polar product IDs to our internal plan IDs.
 * Built dynamically from environment variables.
 */
const POLAR_PRODUCT_TO_PLAN: Record<string, PlanId> = {
	...(POLAR_PRODUCT_FREE && { [POLAR_PRODUCT_FREE]: "free" as const }),
	...(POLAR_PRODUCT_PRO_MONTHLY && { [POLAR_PRODUCT_PRO_MONTHLY]: "pro" as const }),
	...(POLAR_PRODUCT_PRO_ANNUAL && { [POLAR_PRODUCT_PRO_ANNUAL]: "pro" as const }),
	...(POLAR_PRODUCT_ENTERPRISE && { [POLAR_PRODUCT_ENTERPRISE]: "enterprise" as const }),
};

/**
 * Maps Polar subscription status to our internal status.
 */
function mapPolarStatus(polarStatus: string): SubscriptionStatus {
	switch (polarStatus) {
		case "active":
			return "active";
		case "canceled":
			return "canceled";
		case "past_due":
		case "unpaid":
			return "past_due";
		case "trialing":
			return "trialing";
		default:
			return "active";
	}
}

/**
 * Extracts plan ID from a Polar subscription.
 * Falls back to "pro" if product ID not mapped.
 */
function getPlanFromSubscription(subscription: {
	productId?: string;
	product?: { id?: string };
}): PlanId {
	const productId = subscription.productId ?? subscription.product?.id;
	if (productId && POLAR_PRODUCT_TO_PLAN[productId]) {
		return POLAR_PRODUCT_TO_PLAN[productId];
	}
	// Default to pro for any paid subscription
	return "pro";
}

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: authSchema.user,
			session: authSchema.session,
			account: authSchema.account,
			verification: authSchema.verification,
			organization: authSchema.organization,
			member: authSchema.member,
			invitation: authSchema.invitation,
		},
	}),
	secret: secret,
	baseURL: baseURL,
	trustedOrigins: trustedOrigins,
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	session: {
		expiresIn: SESSION_EXPIRES_IN_SECONDS,
		updateAge: SESSION_UPDATE_AGE_SECONDS,
	},
	plugins: [
		polar({
			client: polarClient,
			createCustomerOnSignUp: true,
			use: [
				checkout({
					authenticatedUsersOnly: true,
					products: [
						POLAR_PRODUCT_PRO_MONTHLY && {
							productId: POLAR_PRODUCT_PRO_MONTHLY,
							slug: "pro-monthly",
						},
						POLAR_PRODUCT_PRO_ANNUAL && {
							productId: POLAR_PRODUCT_PRO_ANNUAL,
							slug: "pro-annual",
						},
						POLAR_PRODUCT_ENTERPRISE && {
							productId: POLAR_PRODUCT_ENTERPRISE,
							slug: "enterprise",
						},
					].filter(Boolean) as { productId: string; slug: string }[],
					successUrl: "/settings/billing?checkout=success",
					returnUrl: "/settings/billing",
				}),
				portal({
					returnUrl: "/settings/billing",
				}),
				usage(),
				webhooks({
					secret: process.env.POLAR_WEBHOOK_SECRET ?? "",
					onSubscriptionCreated: async ({ data: sub }) => {
						// New subscription activated - upgrade the organization
						// The subscription metadata should contain the organizationId
						const orgId = (sub.metadata as Record<string, unknown> | null)?.organizationId as
							| string
							| undefined;
						if (!orgId) return;

						await subscriptionService.syncFromPolar(orgId, {
							planId: getPlanFromSubscription(sub),
							status: mapPolarStatus(sub.status),
							polarCustomerId: sub.customerId,
							polarSubscriptionId: sub.id,
							currentPeriodStart: sub.currentPeriodStart
								? new Date(sub.currentPeriodStart)
								: undefined,
							currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined,
						});
					},
					onSubscriptionUpdated: async ({ data: sub }) => {
						// Subscription changed (plan change, renewal, etc.)
						const orgId = (sub.metadata as Record<string, unknown> | null)?.organizationId as
							| string
							| undefined;
						if (!orgId) return;

						await subscriptionService.syncFromPolar(orgId, {
							planId: getPlanFromSubscription(sub),
							status: mapPolarStatus(sub.status),
							currentPeriodStart: sub.currentPeriodStart
								? new Date(sub.currentPeriodStart)
								: undefined,
							currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined,
						});
					},
					onSubscriptionCanceled: async ({ data: sub }) => {
						// Subscription canceled - will downgrade at period end
						const orgId = (sub.metadata as Record<string, unknown> | null)?.organizationId as
							| string
							| undefined;
						if (!orgId) return;

						await subscriptionService.syncFromPolar(orgId, {
							planId: getPlanFromSubscription(sub),
							status: "canceled",
							currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined,
						});
					},
					onSubscriptionRevoked: async ({ data: sub }) => {
						// Subscription immediately revoked (failed payment) - downgrade now
						const orgId = (sub.metadata as Record<string, unknown> | null)?.organizationId as
							| string
							| undefined;
						if (!orgId) return;

						await subscriptionService.downgradeToFree(orgId);
					},
				}),
			],
		}),
		organization({
			allowUserToCreateOrganization: true,
			organizationLimit: ORGANIZATION_LIMIT_PER_USER,
			creatorRole: ORGANIZATION_CREATOR_ROLE,
			membershipLimit: ORGANIZATION_MEMBERSHIP_LIMIT,
		}),
		admin(),
		sveltekitCookies(getRequestEvent),
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
