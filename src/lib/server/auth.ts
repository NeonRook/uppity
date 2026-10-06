import { getRequestEvent } from "$app/server";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { polar, checkout, portal, webhooks } from "@polar-sh/better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { admin, organization } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { nanoid } from "nanoid";

import {
	ORGANIZATION_CREATOR_ROLE,
	ORGANIZATION_LIMIT_PER_USER,
	SESSION_EXPIRES_IN_SECONDS,
	SESSION_UPDATE_AGE_SECONDS,
} from "#lib/constants/auth.js";
import { DEFAULT_PLAN_ID } from "#lib/constants/plans.js";
import { BILLING_PATHS, refuseBillingRequest } from "#lib/server/billing-authorization.js";
import * as authSchema from "#lib/server/db/auth-schema.js";
import { db } from "#lib/server/db/index.js";
import { subscription } from "#lib/server/db/schema.js";
import {
	wideEvent,
	type WebhookWideEvent,
	type WideEventBuilder,
} from "#lib/server/logger/index.js";
import { polarClient } from "#lib/server/polar.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";
import type {
	HeldPolarSubscription,
	PolarSubscriptionSnapshot,
} from "#lib/server/services/subscription.service.js";
import { smtpFrom, smtpTransport } from "#lib/server/smtp.js";
import type { PlanId, SubscriptionStatus } from "#lib/types/plans.js";

// process.env rather than $env/dynamic/private, which the build can inline.
//
// The https:// fallbacks describe the documented deployment, which sits behind a
// TLS-terminating proxy. Set BETTER_AUTH_URL to the URL users actually visit;
// the fallback is a last resort, not a guess at the scheme. The server itself
// serves plain HTTP and learns its public origin from ORIGIN.
const baseURL = process.env.BETTER_AUTH_URL || "https://localhost:3000";
const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") || [
	"https://localhost:3000",
];

/**
 * Polar products by environment variable (IDs differ between sandbox and
 * production). Only products with a slug are offered at checkout. Dedicated is
 * contact-sales in the UI; its slugs exist so a checkout link can be sent
 * manually once provisioning is agreed.
 */
const POLAR_PRODUCTS: [envId: string | undefined, plan: PlanId, slug?: string][] = [
	[process.env.POLAR_PRODUCT_FREE, "free"],
	[process.env.POLAR_PRODUCT_UPPITY_MONTHLY, "uppity", "uppity-monthly"],
	[process.env.POLAR_PRODUCT_UPPITY_ANNUAL, "uppity", "uppity-annual"],
	[process.env.POLAR_PRODUCT_DEDICATED_MONTHLY, "dedicated", "dedicated-monthly"],
	[process.env.POLAR_PRODUCT_DEDICATED_ANNUAL, "dedicated", "dedicated-annual"],
];

/** Maps Polar product IDs to our internal plan IDs. */
const POLAR_PRODUCT_TO_PLAN: Record<string, PlanId> = Object.fromEntries(
	POLAR_PRODUCTS.flatMap(([productId, plan]) => (productId ? [[productId, plan]] : [])),
);

/**
 * Maps Polar subscription status to our internal status.
 */
const POLAR_STATUS: Record<string, SubscriptionStatus> = {
	canceled: "canceled",
	past_due: "past_due",
	unpaid: "past_due",
	trialing: "trialing",
};

export function mapPolarStatus(polarStatus: string): SubscriptionStatus {
	return POLAR_STATUS[polarStatus] ?? "active";
}

/** The subscription a webhook is about, which must be the one the organization holds. */
function heldBy(sub: { id: string; customer_id: string }): HeldPolarSubscription {
	return { polarSubscriptionId: sub.id, polarCustomerId: sub.customer_id };
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
	product_id?: string;
	product?: { id?: string };
}): PlanId {
	const productId = sub.product_id ?? sub.product?.id;
	if (productId && POLAR_PRODUCT_TO_PLAN[productId]) {
		return POLAR_PRODUCT_TO_PLAN[productId];
	}
	// Default to the base paid unit for any unmapped subscription
	return "uppity";
}

/** The plan, status, interval and period a Polar subscription carries. */
export function snapshotFrom(sub: {
	product_id?: string;
	product?: { id?: string };
	status: string;
	recurring_interval: PolarSubscriptionSnapshot["billingInterval"];
	current_period_start?: string | Date | null;
	current_period_end?: string | Date | null;
}): Pick<
	PolarSubscriptionSnapshot,
	"planId" | "status" | "billingInterval" | "currentPeriodStart" | "currentPeriodEnd"
> {
	return {
		planId: getPlanFromSubscription(sub),
		status: mapPolarStatus(sub.status),
		billingInterval: sub.recurring_interval,
		currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start) : undefined,
		currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : undefined,
	};
}

const NOT_BILLED_THROUGH = "for a subscription the org is not billed through";

/**
 * Builds a Polar webhook handler that emits one wide event per delivery. `run`
 * returns why it declined to apply the event, or undefined on success. Errors are
 * recorded and rethrown so Polar retries.
 */
function polarHandler<T>(
	name: string,
	fields: (data: T) => Partial<WebhookWideEvent>,
	run: (data: T, event: WideEventBuilder<WebhookWideEvent>) => Promise<string | undefined>,
) {
	const label = name.replace(/[._]/g, " ");
	return async ({ data }: { data: T }): Promise<void> => {
		const event = wideEvent<WebhookWideEvent>("webhook", "webhook", "whk");
		event.merge({ webhook_source: "polar", webhook_event: name, ...fields(data) });
		try {
			const declined = await run(data, event);
			if (declined) {
				event.setStatus("error");
				event.emit(`${label} ${declined}`);
				return;
			}
			event.setSuccess();
			event.emit(label);
		} catch (error) {
			event.setError(error);
			event.emit(label);
			throw error;
		}
	};
}

/**
 * `polarHandler` for events that carry the organization in `metadata.referenceId`.
 *
 * A payload without one is a paid event this app cannot attribute to an
 * organization: the customer is charged and granted nothing, and no retry can fix
 * it because the reference is absent from the payload itself. It is logged at
 * error level so it alerts, and returns instead of throwing, since a Polar retry
 * would replay the same payload forever.
 */
function polarOrgHandler<T extends { metadata?: Record<string, unknown> }>(
	name: string,
	fields: (data: T) => Partial<WebhookWideEvent>,
	run: (
		data: T,
		orgId: string,
		event: WideEventBuilder<WebhookWideEvent>,
	) => Promise<string | undefined>,
) {
	return polarHandler<T>(name, fields, async (data, event) => {
		const orgId = data.metadata?.referenceId as string | undefined;
		if (!orgId) return "without org reference";
		event.set("org_id", orgId);
		return run(data, orgId, event);
	});
}

function subscriptionFields(
	sub: { id: string; customer_id: string; product_id?: string },
	status: string,
): Partial<WebhookWideEvent> {
	return {
		polar_subscription_id: sub.id,
		polar_customer_id: sub.customer_id,
		plan_id: getPlanFromSubscription(sub),
		subscription_status: status,
	};
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
			if (!smtpTransport) {
				console.warn("[auth] SMTP not configured — skipping password reset email");
				return;
			}

			await smtpTransport.sendMail({
				from: smtpFrom,
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
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (!BILLING_PATHS.has(ctx.path)) return;
			const session = await getSessionFromCtx(ctx);
			const refusal = await refuseBillingRequest(
				{ path: ctx.path, userId: session?.user.id, body: ctx.body, query: ctx.query },
				(organizationId, userId) => subscriptionService.canManageBilling(organizationId, userId),
			);
			if (refusal) throw new APIError("FORBIDDEN", { message: refusal });
		}),
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
					products: POLAR_PRODUCTS.flatMap(([productId, , slug]) =>
						productId && slug ? [{ productId, slug }] : [],
					),
					// Polar substitutes the placeholder. The billing page uses it to pull the
					// new subscription on return instead of waiting for the webhook.
					successUrl: `${baseURL}/settings/billing?checkout=success&checkout_id={CHECKOUT_ID}`,
					returnUrl: `${baseURL}/settings/billing`,
				}),
				portal({
					returnUrl: `${baseURL}/settings/billing`,
				}),
				// No `usage()` plugin: it exposes /usage/ingest, letting any signed-in user post
				// meter events as their own Polar customer. MeterService ingests server-side.
				webhooks({
					secret: process.env.POLAR_WEBHOOK_SECRET ?? "",
					onSubscriptionCreated: polarOrgHandler(
						"subscription.created",
						(sub) => subscriptionFields(sub, sub.status),
						async (sub, orgId) => {
							// The checkout endpoint already refuses this; checked again here because
							// this write is what attaches a subscription to an organization.
							const payer = sub.customer.external_id;
							if (!payer || !(await subscriptionService.canManageBilling(orgId, payer))) {
								return "by someone who does not manage the org";
							}

							await subscriptionService.syncFromPolar(orgId, {
								...snapshotFrom(sub),
								polarCustomerId: sub.customer_id,
								polarSubscriptionId: sub.id,
							});
							return undefined;
						},
					),
					onSubscriptionUpdated: polarOrgHandler(
						"subscription.updated",
						(sub) => subscriptionFields(sub, sub.status),
						async (sub, orgId) => {
							const synced = await subscriptionService.syncHeldFromPolar(
								orgId,
								heldBy(sub),
								snapshotFrom(sub),
							);
							return synced ? undefined : NOT_BILLED_THROUGH;
						},
					),
					onSubscriptionCanceled: polarOrgHandler(
						"subscription.canceled",
						(sub) => subscriptionFields(sub, "canceled"),
						async (sub, orgId) => {
							const synced = await subscriptionService.syncHeldFromPolar(orgId, heldBy(sub), {
								...snapshotFrom(sub),
								status: "canceled",
							});
							return synced ? undefined : NOT_BILLED_THROUGH;
						},
					),
					// Fires for every paid order: first purchase, renewal and seat change
					// alike. Plan state is already maintained by the subscription.*
					// handlers above, which carry the period boundaries this event does
					// not, so this exists as a payment audit trail rather than a second
					// path into SubscriptionService.
					//
					// TODO(NEO-?): one-time purchases (credit packs, setup fees) have no
					// subscription.* event, so they will need to be granted here once such
					// a product exists. Every product sold today is a subscription.
					onOrderPaid: polarOrgHandler(
						"order.paid",
						(order) => ({
							polar_order_id: order.id,
							polar_customer_id: order.customer_id,
							polar_product_id: order.product_id ?? undefined,
							polar_subscription_id: order.subscription_id ?? undefined,
						}),
						async () => undefined,
					),
					// Polar's authoritative snapshot of everything a customer currently has.
					// Useful as a reconciliation source when an individual subscription.*
					// event is missed or arrives out of order.
					//
					// No org_id on purpose. A Polar customer is keyed to a better-auth
					// user (the plugin hardcodes externalCustomerId to session.user.id),
					// and a user may own several organizations, so the customer alone
					// cannot identify one. Org identity lives on each subscription's
					// metadata.referenceId, not on the customer.
					//
					// TODO(NEO-?): reconcile drift against activeSubscriptions, reading
					// referenceId from each subscription's own metadata. This is the only
					// event able to repair a subscription whose webhook was never
					// received. Deliberately not wired up yet - a reconciler that
					// disagrees with the subscription.* handlers would silently overwrite
					// them on every benefit grant, so precedence needs its own design pass.
					onCustomerStateChanged: polarHandler(
						"customer.state_changed",
						(customer) => ({
							polar_customer_id: customer.id,
							active_subscription_count: customer.active_subscriptions.length,
						}),
						async () => undefined,
					),
					onSubscriptionRevoked: polarOrgHandler(
						"subscription.revoked",
						(sub) => ({
							polar_subscription_id: sub.id,
							polar_customer_id: sub.customer_id,
							subscription_status: "revoked",
						}),
						async (sub, orgId, event) => {
							const downgraded = await subscriptionService.downgradeHeldToFree(orgId, heldBy(sub));
							if (!downgraded) return NOT_BILLED_THROUGH;
							event.set("plan_id", "free");
							return undefined;
						},
					),
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
