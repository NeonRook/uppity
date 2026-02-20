import { getRequestEvent } from "$app/server";
import {
	ORGANIZATION_CREATOR_ROLE,
	ORGANIZATION_LIMIT_PER_USER,
	ORGANIZATION_MEMBERSHIP_LIMIT,
	SESSION_EXPIRES_IN_SECONDS,
	SESSION_UPDATE_AGE_SECONDS,
} from "$lib/constants/auth";
import { DEFAULT_PLAN_ID } from "$lib/constants/plans";
import { db } from "$lib/server/db";
import * as authSchema from "$lib/server/db/auth-schema";
import { subscription } from "$lib/server/db/schema";
import { createWebhookWideEvent } from "$lib/server/logger";
import { subscriptionService } from "$lib/server/services/subscription.service";
import type { PlanId, SubscriptionStatus } from "$lib/types/plans";
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { nanoid } from "nanoid";

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
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// Create a personal organization for new users
					const orgId = nanoid();
					const now = new Date();
					const slug = `${user.name
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/(^-|-$)/g, "")}-${nanoid(6)}`;

					// Create the organization
					await db.insert(authSchema.organization).values({
						id: orgId,
						name: `${user.name}'s Organization`,
						slug,
						createdAt: now,
					});

					// Add user as owner
					await db.insert(authSchema.member).values({
						id: nanoid(),
						organizationId: orgId,
						userId: user.id,
						role: ORGANIZATION_CREATOR_ROLE,
						createdAt: now,
					});

					// Create free subscription for the organization
					await db.insert(subscription).values({
						id: nanoid(),
						organizationId: orgId,
						planId: DEFAULT_PLAN_ID,
						status: "active",
					});
				},
			},
		},
	},
	plugins: [
		polar({
			client: polarClient,
			// Don't create Polar customer on signup - it fails for test emails (example.com)
			// and blocks registration. Customers are created lazily on first checkout/portal access.
			createCustomerOnSignUp: false,
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
					successUrl: `${baseURL}/settings/billing?checkout=success`,
					returnUrl: `${baseURL}/settings/billing`,
				}),
				portal({
					returnUrl: `${baseURL}/settings/billing`,
				}),
				usage(),
				webhooks({
					secret: process.env.POLAR_WEBHOOK_SECRET ?? "",
					onSubscriptionCreated: async ({ data: sub }) => {
						const event = createWebhookWideEvent("polar");
						event.merge({
							webhook_event: "subscription.created",
							polar_subscription_id: sub.id,
							polar_customer_id: sub.customerId,
							plan_id: getPlanFromSubscription(sub),
							subscription_status: sub.status,
						});

						try {
							const orgId = sub.metadata?.referenceId as string | undefined;
							if (!orgId) {
								event.merge({ org_id: undefined });
								event.setSuccess();
								event.emitWarn("subscription created without org reference");
								return;
							}

							event.set("org_id", orgId);
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

							event.setSuccess();
							event.emit("subscription created");
						} catch (error) {
							event.setError(error);
							event.emit("subscription created");
							throw error;
						}
					},
					onSubscriptionUpdated: async ({ data: sub }) => {
						const event = createWebhookWideEvent("polar");
						event.merge({
							webhook_event: "subscription.updated",
							polar_subscription_id: sub.id,
							polar_customer_id: sub.customerId,
							plan_id: getPlanFromSubscription(sub),
							subscription_status: sub.status,
						});

						try {
							const orgId = sub.metadata?.referenceId as string | undefined;
							if (!orgId) {
								event.setSuccess();
								event.emitWarn("subscription updated without org reference");
								return;
							}

							event.set("org_id", orgId);
							await subscriptionService.syncFromPolar(orgId, {
								planId: getPlanFromSubscription(sub),
								status: mapPolarStatus(sub.status),
								currentPeriodStart: sub.currentPeriodStart
									? new Date(sub.currentPeriodStart)
									: undefined,
								currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined,
							});

							event.setSuccess();
							event.emit("subscription updated");
						} catch (error) {
							event.setError(error);
							event.emit("subscription updated");
							throw error;
						}
					},
					onSubscriptionCanceled: async ({ data: sub }) => {
						const event = createWebhookWideEvent("polar");
						event.merge({
							webhook_event: "subscription.canceled",
							polar_subscription_id: sub.id,
							polar_customer_id: sub.customerId,
							plan_id: getPlanFromSubscription(sub),
							subscription_status: "canceled",
						});

						try {
							const orgId = sub.metadata?.referenceId as string | undefined;
							if (!orgId) {
								event.setSuccess();
								event.emitWarn("subscription canceled without org reference");
								return;
							}

							event.set("org_id", orgId);
							await subscriptionService.syncFromPolar(orgId, {
								planId: getPlanFromSubscription(sub),
								status: "canceled",
								currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : undefined,
							});

							event.setSuccess();
							event.emit("subscription canceled");
						} catch (error) {
							event.setError(error);
							event.emit("subscription canceled");
							throw error;
						}
					},
					onSubscriptionRevoked: async ({ data: sub }) => {
						const event = createWebhookWideEvent("polar");
						event.merge({
							webhook_event: "subscription.revoked",
							polar_subscription_id: sub.id,
							polar_customer_id: sub.customerId,
							subscription_status: "revoked",
						});

						try {
							const orgId = sub.metadata?.referenceId as string | undefined;
							if (!orgId) {
								event.setSuccess();
								event.emitWarn("subscription revoked without org reference");
								return;
							}

							event.set("org_id", orgId);
							await subscriptionService.downgradeToFree(orgId);

							event.set("plan_id", "free");
							event.setSuccess();
							event.emit("subscription revoked");
						} catch (error) {
							event.setError(error);
							event.emit("subscription revoked");
							throw error;
						}
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
