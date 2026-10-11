import { and, desc, eq, isNotNull } from "drizzle-orm";

import type { Db } from "../db/index";
import {
	incidentMonitor,
	incidentUpdate,
	statusPage,
	statusPageMonitor,
	statusPageSubscriber,
	statusPageSubscriberDelivery,
	type Incident,
} from "../db/schema";
import type { SubscriberIncidentEmail } from "../subscriber-email";

/** Keeps each claim insert well under Postgres's bind parameter limit. */
const CLAIM_CHUNK = 1000;

export type SendSubscriberIncidentEmail = (email: SubscriberIncidentEmail) => Promise<void>;

/**
 * Emails an incident event to the confirmed subscribers of every public page that shows
 * the incident. Each subscriber is claimed before sending, so a retried or concurrently
 * reclaimed event never emails anyone twice. Sends one at a time to stay within SMTP
 * rate limits. Null when no subscriber is due an email.
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
		.where(isNotNull(s.verifiedAt));

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
