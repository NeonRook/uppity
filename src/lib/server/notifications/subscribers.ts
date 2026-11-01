import { and, countDistinct, desc, eq, isNotNull, notExists } from "drizzle-orm";

import { isSelfHosted } from "#lib/constants/plans.js";

import { organization } from "../db/auth-schema";
import type { Db, DbExecutor } from "../db/index";
import {
	emailSuppression,
	incidentMonitor,
	incidentUpdate,
	statusPage,
	statusPageMonitor,
	statusPageSubscriber,
	statusPageSubscriberDelivery,
	type Incident,
} from "../db/schema";
import { logger } from "../logger";
import type { SubscriberIncidentEmail } from "../subscriber-email";

/** Keeps each claim insert well under Postgres's bind parameter limit. */
const CLAIM_CHUNK = 1000;

export type SendSubscriberIncidentEmail = (email: SubscriberIncidentEmail) => Promise<void>;

/**
 * Whether this instance enforces the per-organization switch. Only an instance that asks
 * for it does, so one that has never heard of the setting keeps sending. The web server
 * and the notifier both decide through here, and both need the setting.
 */
export function subscriberEmailGated(): boolean {
	return process.env.UPPITY_GATE_SUBSCRIBER_EMAIL === "true" && !isSelfHosted();
}

/**
 * Whether an organization's status pages take subscribers and email them. `lock` holds the
 * organization row until the caller's transaction ends, so the switch cannot go off while
 * that transaction acts on the answer.
 */
export async function subscriberEmailEnabled(
	db: DbExecutor,
	organizationId: string,
	{ lock = false } = {},
): Promise<boolean> {
	if (!subscriberEmailGated()) return true;

	const query = db
		.select({ enabled: organization.subscriberEmailEnabled })
		.from(organization)
		.where(eq(organization.id, organizationId));
	const [org] = await (lock ? query.for("share") : query);
	return org?.enabled ?? false;
}

/** Addresses that incident email reaches from the organization's public status pages. */
export async function reachableSubscribers(
	db: DbExecutor,
	organizationId: string,
): Promise<number> {
	const s = statusPageSubscriber;
	const [row] = await db
		.select({ reachable: countDistinct(s.email) })
		.from(s)
		.innerJoin(
			statusPage,
			and(
				eq(statusPage.id, s.statusPageId),
				eq(statusPage.isPublic, true),
				eq(statusPage.organizationId, organizationId),
			),
		)
		.where(
			and(
				isNotNull(s.verifiedAt),
				notExists(
					db
						.select({ email: emailSuppression.email })
						.from(emailSuppression)
						.where(eq(emailSuppression.email, s.email)),
				),
			),
		);
	return row.reachable;
}

/**
 * Emails an incident event to the confirmed subscribers of every public page that shows
 * the incident, except addresses that bounced or complained. Each subscriber is claimed
 * before sending, so a retried or concurrently reclaimed event never emails anyone twice.
 * Sends one at a time to stay within SMTP rate limits. Null when no subscriber is due an
 * email, which includes an organization with subscriber email off.
 */
export async function notifyIncidentSubscribers(
	db: Db,
	send: SendSubscriberIncidentEmail,
	eventId: string,
	kind: SubscriberIncidentEmail["kind"],
	incident: Incident,
	updateMessage: string | undefined,
): Promise<{ sent: number; failures: string[] } | null> {
	const s = statusPageSubscriber;
	const recipients = await db
		.selectDistinct({
			id: s.id,
			email: s.email,
			token: s.token,
			pageName: statusPage.name,
			pageSlug: statusPage.slug,
		})
		.from(s)
		.innerJoin(
			statusPage,
			and(
				eq(statusPage.id, s.statusPageId),
				eq(statusPage.isPublic, true),
				eq(statusPage.organizationId, incident.organizationId),
			),
		)
		.innerJoin(statusPageMonitor, eq(statusPageMonitor.statusPageId, statusPage.id))
		.innerJoin(
			incidentMonitor,
			and(
				eq(incidentMonitor.monitorId, statusPageMonitor.monitorId),
				eq(incidentMonitor.incidentId, incident.id),
			),
		)
		.where(
			and(
				isNotNull(s.verifiedAt),
				notExists(
					db
						.select({ email: emailSuppression.email })
						.from(emailSuppression)
						.where(eq(emailSuppression.email, s.email)),
				),
			),
		);

	if (!(await subscriberEmailEnabled(db, incident.organizationId))) {
		if (recipients.length > 0) {
			logger.warn(
				{
					event_type: "subscriber_email_off",
					organization_id: incident.organizationId,
					event_id: eventId,
					recipients: recipients.length,
				},
				"Subscriber email is off, so confirmed subscribers were not emailed",
			);
		}
		return null;
	}

	const claimed = new Set<string>();
	for (let i = 0; i < recipients.length; i += CLAIM_CHUNK) {
		const rows = await db
			.insert(statusPageSubscriberDelivery)
			.values(recipients.slice(i, i + CLAIM_CHUNK).map((r) => ({ eventId, subscriberId: r.id })))
			.onConflictDoNothing()
			.returning({ subscriberId: statusPageSubscriberDelivery.subscriberId });
		for (const row of rows) claimed.add(row.subscriberId);
	}
	if (claimed.size === 0) return null;

	// A created event carries no message; the incident's opening update is the one to show.
	const message =
		updateMessage ??
		(kind === "incident_created" ? await openingMessage(db, incident.id) : undefined);

	const failures: string[] = [];
	for (const r of recipients) {
		if (!claimed.has(r.id)) continue;
		try {
			await send({
				email: r.email,
				token: r.token,
				page: { name: r.pageName, slug: r.pageSlug },
				incident,
				kind,
				message,
			});
		} catch (err) {
			failures.push(`subscriber ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	return { sent: claimed.size - failures.length, failures };
}

async function openingMessage(db: Db, incidentId: string): Promise<string | undefined> {
	const [update] = await db
		.select({ message: incidentUpdate.message })
		.from(incidentUpdate)
		.where(eq(incidentUpdate.incidentId, incidentId))
		.orderBy(desc(incidentUpdate.createdAt))
		.limit(1);
	return update?.message;
}
