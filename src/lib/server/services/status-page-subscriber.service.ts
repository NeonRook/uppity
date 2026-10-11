import { randomBytes } from "node:crypto";

import { and, count, eq, gt, isNull, lt, or } from "drizzle-orm";
import { nanoid } from "nanoid";

import { SUBSCRIBER_CONFIRMATIONS_PER_DAY } from "#lib/constants/defaults.js";
import type { Db } from "#lib/server/db/index.js";
import { statusPageSubscriber } from "#lib/server/db/schema.js";
import type { SubscriptionConfirmation } from "#lib/server/subscriber-email.js";

/** How long a confirmation link works, and how long an unconfirmed address is kept. */
export const CONFIRMATION_TTL_HOURS = 48;
const CONFIRMATION_TTL_MS = CONFIRMATION_TTL_HOURS * 60 * 60_000;

/** Minimum gap between confirmation emails to one address, so the form cannot flood an inbox. */
export const RESEND_INTERVAL_MS = 15 * 60_000;

export type SubscriberState = "pending" | "confirmed";

export class StatusPageSubscriberService {
	constructor(
		private db: Db,
		private sendConfirmation: (confirmation: SubscriptionConfirmation) => Promise<void>,
		private confirmationsPerDay = SUBSCRIBER_CONFIRMATIONS_PER_DAY,
	) {}

	/**
	 * Records a pending subscription and emails its confirmation link. An address that is
	 * already confirmed, or was sent a link within the resend interval, gets nothing, so
	 * the response cannot reveal who subscribes. False when the page has used up its
	 * daily confirmations.
	 */
	async subscribe(
		page: { id: string; name: string; slug: string },
		email: string,
	): Promise<boolean> {
		const t = statusPageSubscriber;
		const address = email.trim().toLowerCase();
		const now = new Date();

		const [{ sent }] = await this.db
			.select({ sent: count() })
			.from(t)
			.where(
				and(
					eq(t.statusPageId, page.id),
					gt(t.confirmationSentAt, new Date(now.getTime() - 24 * 60 * 60_000)),
				),
			);
		if (sent >= this.confirmationsPerDay) return false;

		const [row] = await this.db
			.insert(t)
			.values({
				id: nanoid(),
				statusPageId: page.id,
				email: address,
				token: randomBytes(32).toString("base64url"),
				confirmationSentAt: now,
			})
			.onConflictDoUpdate({
				target: [t.statusPageId, t.email],
				set: { confirmationSentAt: now },
				setWhere: and(
					isNull(t.verifiedAt),
					or(
						isNull(t.confirmationSentAt),
						lt(t.confirmationSentAt, new Date(now.getTime() - RESEND_INTERVAL_MS)),
					),
				),
			})
			.returning({ id: t.id, token: t.token });
		if (!row) return true;

		try {
			await this.sendConfirmation({ email: address, token: row.token, page });
		} catch (error) {
			// Lets the visitor retry without waiting out the resend interval.
			await this.db.update(t).set({ confirmationSentAt: null }).where(eq(t.id, row.id));
			throw error;
		}
		return true;
	}

	/** Null when the token is unknown, or its confirmation link has expired. */
	async lookup(statusPageId: string, token: string): Promise<SubscriberState | null> {
		const t = statusPageSubscriber;
		const [row] = await this.db
			.select({ verifiedAt: t.verifiedAt, confirmationSentAt: t.confirmationSentAt })
			.from(t)
			.where(and(eq(t.statusPageId, statusPageId), eq(t.token, token)));

		if (!row) return null;
		if (row.verifiedAt) return "confirmed";
		return row.confirmationSentAt && row.confirmationSentAt > confirmationCutoff()
			? "pending"
			: null;
	}

	/** Whether the subscription is confirmed afterwards. Confirming twice is not an error. */
	async confirm(statusPageId: string, token: string): Promise<boolean> {
		const t = statusPageSubscriber;
		const [row] = await this.db
			.update(t)
			.set({ verifiedAt: new Date() })
			.where(
				and(
					eq(t.statusPageId, statusPageId),
					eq(t.token, token),
					isNull(t.verifiedAt),
					gt(t.confirmationSentAt, confirmationCutoff()),
				),
			)
			.returning({ id: t.id });

		return row !== undefined || (await this.lookup(statusPageId, token)) === "confirmed";
	}

	/** Deletes the subscriber outright. An unknown token is already unsubscribed. */
	async unsubscribe(statusPageId: string, token: string): Promise<void> {
		const t = statusPageSubscriber;
		await this.db.delete(t).where(and(eq(t.statusPageId, statusPageId), eq(t.token, token)));
	}
}

const confirmationCutoff = () => new Date(Date.now() - CONFIRMATION_TTL_MS);

/** Deletes addresses whose confirmation link expired unused. Returns how many. */
export async function deleteExpiredUnconfirmedSubscribers(db: Db): Promise<number> {
	const t = statusPageSubscriber;
	const deleted = await db
		.delete(t)
		.where(
			and(
				isNull(t.verifiedAt),
				or(isNull(t.confirmationSentAt), lt(t.confirmationSentAt, confirmationCutoff())),
			),
		)
		.returning({ id: t.id });
	return deleted.length;
}
