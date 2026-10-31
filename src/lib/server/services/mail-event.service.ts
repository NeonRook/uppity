import { lt } from "drizzle-orm";

import type { Db } from "#lib/server/db/index.js";
import { emailSuppression, mailEvent } from "#lib/server/db/schema.js";
import type { MailFailure } from "#lib/server/resend-webhook.js";

/** Longer than the provider retries a webhook, so a late retry still finds its row. */
const EVENT_RETENTION_MS = 7 * 24 * 60 * 60_000;

/** Suppresses the addresses in a provider event. A retried event changes nothing. */
export async function recordMailFailure(
	db: Db,
	eventId: string,
	{ kind, recipients }: MailFailure,
): Promise<void> {
	await db.transaction(async (tx) => {
		const [fresh] = await tx
			.insert(mailEvent)
			.values({ id: eventId, kind })
			.onConflictDoNothing()
			.returning({ id: mailEvent.id });
		if (!fresh || recipients.length === 0) return;

		await tx
			.insert(emailSuppression)
			.values(recipients.map((email) => ({ email, reason: kind })))
			.onConflictDoNothing();
	});
}

/** Deletes events past the retry window. Returns how many. */
export async function pruneMailEvents(db: Db): Promise<number> {
	const cutoff = new Date(Date.now() - EVENT_RETENTION_MS);
	const deleted = await db
		.delete(mailEvent)
		.where(lt(mailEvent.receivedAt, cutoff))
		.returning({ id: mailEvent.id });
	return deleted.length;
}
