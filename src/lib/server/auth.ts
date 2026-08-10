import { getRequestEvent } from "$app/server";
import {
	ORGANIZATION_CREATOR_ROLE,
	ORGANIZATION_LIMIT_PER_USER,
	SESSION_EXPIRES_IN_SECONDS,
	SESSION_UPDATE_AGE_SECONDS,
} from "$lib/constants/auth";
import { DEFAULT_EMAIL_FROM, DEFAULT_SMTP_SECURE_PORT } from "$lib/constants/defaults";
import { DEFAULT_PLAN_ID } from "$lib/constants/plans";
import { db } from "$lib/server/db";
import * as authSchema from "$lib/server/db/auth-schema";
import { subscription } from "$lib/server/db/schema";
import { createWebhookWideEvent } from "$lib/server/logger";
import { polarClient } from "$lib/server/polar";
import { subscriptionService } from "$lib/server/services/subscription.service";
import type { PlanId, SubscriptionStatus } from "$lib/types/plans";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { admin, organization } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { nanoid } from "nanoid";
import nodemailer from "nodemailer";

// $env/dynamic/private gets baked in at build time by svelte-adapter-bun
// Note: svelte-adapter-bun presents requests as HTTPS, so defaults must use https://
const baseURL = process.env.BETTER_AUTH_URL || "https://localhost:3000";
const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") || [
	"https://localhost:3000",
];

// Polar product IDs from environment (different for sandbox vs production)
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;

const {
	POLAR_PRODUCT_FREE,
	POLAR_PRODUCT_UPPITY_MONTHLY,
	POLAR_PRODUCT_UPPITY_ANNUAL,
	POLAR_PRODUCT_DEDICATED_MONTHLY,
	POLAR_PRODUCT_DEDICATED_ANNUAL,
} = process.env;

/**
 * Maps Polar product IDs to our internal plan IDs.
 * Built dynamically from environment variables.
 */
const POLAR_PRODUCT_TO_PLAN: Record<string, PlanId> = {
	...(POLAR_PRODUCT_FREE && { [POLAR_PRODUCT_FREE]: "free" as const }),
	...(POLAR_PRODUCT_UPPITY_MONTHLY && { [POLAR_PRODUCT_UPPITY_MONTHLY]: "uppity" as const }),
	...(POLAR_PRODUCT_UPPITY_ANNUAL && { [POLAR_PRODUCT_UPPITY_ANNUAL]: "uppity" as const }),
	...(POLAR_PRODUCT_DEDICATED_MONTHLY && {
		[POLAR_PRODUCT_DEDICATED_MONTHLY]: "dedicated" as const,
	}),
	...(POLAR_PRODUCT_DEDICATED_ANNUAL && { [POLAR_PRODUCT_DEDICATED_ANNUAL]: "dedicated" as const }),
};

/**
 * Maps Polar subscription status to our internal status.
 */
export function mapPolarStatus(polarStatus: string): SubscriptionStatus {
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
 *
 * Falls back to "uppity" — the base paid unit — when a product ID is not mapped.
 * This fails open on purpose: an unmapped product means a configuration slip, and
 * downgrading a paying customer to free mid-period is a far worse outcome than
 * briefly granting the base tier to someone who bought Dedicated.
 */
export function getPlanFromSubscription(sub: {
	productId?: string;
	product?: { id?: string };
}): PlanId {
	const productId = sub.productId ?? sub.product?.id;
	if (productId && POLAR_PRODUCT_TO_PLAN[productId]) {
		return POLAR_PRODUCT_TO_PLAN[productId];
	}
	// Default to the base paid unit for any unmapped subscription
	return "uppity";
}

/**
 * Built from `better-auth/minimal` rather than `better-auth`.
 *
 * Same core; the difference is that its init only accepts a prebuilt adapter
 * instead of also being able to construct a Kysely dialect from a connection
 * string. That drops Kysely and its sqlite/mysql/mssql dialects from the SSR
 * bundle. Both capabilities it gives up were already unused: `drizzleAdapter`
 * below has always been the only database path, and drizzle-kit owns migrations.
 *
 * Switching `database` to anything other than an adapter will throw at startup.
 */
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
	baseURL: baseURL,
	trustedOrigins: trustedOrigins,
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
		async sendResetPassword({ user, url }) {
			if (!SMTP_HOST || !SMTP_PORT) {
				console.warn("[auth] SMTP not configured — skipping password reset email");
				return;
			}

			const transporter = nodemailer.createTransport({
				host: SMTP_HOST,
				port: parseInt(SMTP_PORT, 10),
				secure: SMTP_PORT === String(DEFAULT_SMTP_SECURE_PORT),
				auth: SMTP_USER && SMTP_PASSWORD ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
			});

			const from = SMTP_FROM || DEFAULT_EMAIL_FROM;

			await transporter.sendMail({
				from,
				to: user.email,
				subject: "Reset your password — Uppity",
				html: `
					<h2>Password Reset</h2>
					<p>We received a request to reset your password. Click the button below to choose a new one.</p>
					<p><a href="${url}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
					<p>If you didn't request this, you can safely ignore this email.</p>
					<p style="color:#666;font-size:12px;">This link will expire shortly.</p>
				`,
				text: `Reset your password by visiting: ${url}\n\nIf you didn't request this, you can safely ignore this email.`,
			});
		},
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
			// Keep this false. The plugin creates the customer in a `before` hook that
			// rethrows any failure as INTERNAL_SERVER_ERROR, so enabling it makes Polar
			// a hard dependency of registration: an outage, a rate limit, or an address
			// their validator rejects (they check deliverability, not just syntax --
			// example.com returns 422) all become "you cannot sign up".
			//
			// It also mismatches the billing model. The plugin keys customers by user id,
			// while billing is per organization via `referenceId`, so eager creation mints
			// a customer for every teammate who joins an org and never pays.
			//
			// Customers are created lazily on first checkout instead. `hasCustomerAccount`
			// in settings/billing gates the portal link until one exists.
			createCustomerOnSignUp: false,
			use: [
				checkout({
					authenticatedUsersOnly: true,
					products: [
						POLAR_PRODUCT_UPPITY_MONTHLY && {
							productId: POLAR_PRODUCT_UPPITY_MONTHLY,
							slug: "uppity-monthly",
						},
						POLAR_PRODUCT_UPPITY_ANNUAL && {
							productId: POLAR_PRODUCT_UPPITY_ANNUAL,
							slug: "uppity-annual",
						},
						// Dedicated is contact-sales in the UI; these slugs exist so a
						// checkout link can be sent manually once provisioning is agreed.
						POLAR_PRODUCT_DEDICATED_MONTHLY && {
							productId: POLAR_PRODUCT_DEDICATED_MONTHLY,
							slug: "dedicated-monthly",
						},
						POLAR_PRODUCT_DEDICATED_ANNUAL && {
							productId: POLAR_PRODUCT_DEDICATED_ANNUAL,
							slug: "dedicated-annual",
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
								// A paid subscription this app cannot attribute to an organization:
								// the customer is charged and granted nothing, and no retry can fix
								// it because the reference is absent from the payload itself. Logged
								// at error level so it alerts rather than sitting in a warning
								// stream. Returns instead of throwing - a Polar retry would replay
								// the same referenceId-less payload forever.
								event.setStatus("error");
								event.emit("subscription created without org reference");
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
								event.setStatus("error");
								event.emit("subscription updated without org reference");
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
								event.setStatus("error");
								event.emit("subscription canceled without org reference");
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
					// Fires for every paid order: first purchase, renewal and seat change
					// alike. Plan state is already maintained by the subscription.*
					// handlers above, which carry the period boundaries this event does
					// not, so this exists as a payment audit trail rather than a second
					// path into SubscriptionService.
					onOrderPaid: async ({ data: order }) => {
						const event = createWebhookWideEvent("polar");
						event.merge({
							webhook_event: "order.paid",
							polar_order_id: order.id,
							polar_customer_id: order.customerId,
							polar_product_id: order.productId ?? undefined,
							polar_subscription_id: order.subscriptionId ?? undefined,
						});

						try {
							const orgId = order.metadata?.referenceId as string | undefined;
							if (!orgId) {
								event.setStatus("error");
								event.emit("order paid without org reference");
								return;
							}

							event.set("org_id", orgId);

							// TODO(NEO-?): one-time purchases (credit packs, setup fees) have no
							// subscription.* event, so they will need to be granted here once such
							// a product exists. Every product sold today is a subscription.
							await Promise.resolve();

							event.setSuccess();
							event.emit("order paid");
						} catch (error) {
							event.setError(error);
							event.emit("order paid");
							throw error;
						}
					},
					// Polar's authoritative snapshot of everything a customer currently has.
					// Useful as a reconciliation source when an individual subscription.*
					// event is missed or arrives out of order.
					onCustomerStateChanged: async ({ data: customer }) => {
						const event = createWebhookWideEvent("polar");
						event.merge({
							webhook_event: "customer.state_changed",
							polar_customer_id: customer.id,
							active_subscription_count: customer.activeSubscriptions.length,
						});

						try {
							// No org_id on purpose. A Polar customer is keyed to a better-auth
							// user (the plugin hardcodes externalCustomerId to session.user.id),
							// and a user may own several organizations, so the customer alone
							// cannot identify one. Org identity lives on each subscription's
							// metadata.referenceId, not on the customer.

							// TODO(NEO-?): reconcile drift against activeSubscriptions, reading
							// referenceId from each subscription's own metadata. This is the only
							// event able to repair a subscription whose webhook was never
							// received. Deliberately not wired up yet - a reconciler that
							// disagrees with the subscription.* handlers would silently overwrite
							// them on every benefit grant, so precedence needs its own design pass.
							await Promise.resolve();

							event.setSuccess();
							event.emit("customer state changed");
						} catch (error) {
							event.setError(error);
							event.emit("customer state changed");
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
								event.setStatus("error");
								event.emit("subscription revoked without org reference");
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
			// better-auth checks this during acceptInvitation against the accepted
			// member count, which also covers direct member adds. -1 plans resolve to
			// ORGANIZATION_MEMBERSHIP_LIMIT inside getMemberCapacity.
			membershipLimit: async (_user, org) =>
				(await subscriptionService.getMemberCapacity(org.id)).limit,
			organizationHooks: {
				// membershipLimit alone counts accepted members only, so an org could
				// mass-invite past its cap. This applies the members-plus-invitations
				// rule at invite time; throwing here aborts the invitation.
				beforeCreateInvitation: async ({ organization: org }) => {
					const capacity = await subscriptionService.getMemberCapacity(org.id);
					if (!capacity.canInvite) {
						throw new APIError("FORBIDDEN", {
							message: `Your plan allows ${capacity.limit} team members. Upgrade to invite more.`,
						});
					}
				},
			},
		}),
		admin(),
		sveltekitCookies(getRequestEvent),
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
