import { and, between, count, eq, gt, inArray, lt, sql } from "drizzle-orm";

import { MAIL_REPUTATION, UNSOLICITED_MAIL_DAILY_CEILING } from "#lib/constants/defaults.js";
import type { Db, DbExecutor } from "#lib/server/db/index.js";
import {
	emailSuppression,
	mailEvent,
	organizationMailBlock,
	unsolicitedMailSend,
} from "#lib/server/db/schema.js";
import { raiseOpsAlert } from "#lib/server/ops-alert.js";
import type { MailFailure } from "#lib/server/resend-webhook.js";

const DAY_MS = 24 * 60 * 60_000;

/**
 * How far a provider's timestamp may sit from our record of the send. SMTP keeps neither tags
 * nor our Message-ID, so the address and this moment are what tie a bounce to a send.
 */
const ATTRIBUTION_WINDOW_MS = 5 * 60_000;

export type MailRefusal = "suppressed" | "blocked" | "ceiling";

/** Decides whether mail to an address that never agreed to it may go out. Alerts never pass here. */
export class UnsolicitedMailGuard {
	constructor(
		private db: Db,
		private ceiling = UNSOLICITED_MAIL_DAILY_CEILING,
	) {}

	/**
	 * Why the organization may not email the lowercased address, if so. Inside a transaction,
	 * the ceiling stays held until it ends, so `record` must follow in that transaction.
	 */
	async refusal(
		tx: DbExecutor,
		organizationId: string,
		email: string,
	): Promise<MailRefusal | null> {
		const [suppressed] = await tx
			.select({ email: emailSuppression.email })
			.from(emailSuppression)
			.where(eq(emailSuppression.email, email));
		if (suppressed) return "suppressed";

		const [block] = await tx
			.select({ organizationId: organizationMailBlock.organizationId })
			.from(organizationMailBlock)
			.where(eq(organizationMailBlock.organizationId, organizationId));
		if (block) return "blocked";

		if (this.ceiling <= 0) return null;

		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('unsolicited_mail_ceiling'))`);
		const [{ sent }] = await tx
			.select({ sent: count() })
			.from(unsolicitedMailSend)
			.where(gt(unsolicitedMailSend.sentAt, new Date(Date.now() - DAY_MS)));
		if (sent < this.ceiling) return null;

		void raiseOpsAlert(this.db, {
			type: "unsolicited_mail_ceiling",
			subject: "instance",
			title: "Unsolicited mail ceiling reached",
			body: `${sent} emails to new addresses went out in the past 24 hours, against a ceiling of ${this.ceiling}. Further sends are refused until the count drops.`,
		});
		return "ceiling";
	}

	async record(
		tx: DbExecutor,
		send: { id: string; organizationId: string; email: string },
	): Promise<void> {
		await tx.insert(unsolicitedMailSend).values(send);
	}

	/** Gives back a send that never went out, so it neither counts nor takes a bounce. */
	async release(tx: DbExecutor, id: string): Promise<void> {
		await tx.delete(unsolicitedMailSend).where(eq(unsolicitedMailSend.id, id));
	}
}

/**
 * Suppresses the addresses in a provider event and charges it to the organization whose send
 * it answers, which may block that organization. Everything here comes from the signed event
 * and our own send record, never from what an organization typed. A retry changes nothing.
 */
export async function recordMailFailure(
	db: Db,
	eventId: string,
	{ kind, recipients, sentAt }: MailFailure,
	thresholds = MAIL_REPUTATION,
): Promise<void> {
	const blocked = await db.transaction(async (tx) => {
		const [fresh] = await tx
			.insert(mailEvent)
			.values({ id: eventId, kind })
			.onConflictDoNothing()
			.returning({ id: mailEvent.id });
		if (!fresh || recipients.length === 0) return null;

		await tx
			.insert(emailSuppression)
			.values(recipients.map((email) => ({ email, reason: kind })))
			.onConflictDoNothing();

		const organizationId = await senderOf(tx, recipients, sentAt);
		if (!organizationId) return null;

		await tx.update(mailEvent).set({ organizationId }).where(eq(mailEvent.id, eventId));

		const reason = await crossedThreshold(tx, organizationId, thresholds);
		if (!reason) return null;

		const [block] = await tx
			.insert(organizationMailBlock)
			.values({ organizationId, reason })
			.onConflictDoNothing()
			.returning({ organizationId: organizationMailBlock.organizationId });
		return block ? { organizationId, reason } : null;
	});

	if (blocked) {
		void raiseOpsAlert(db, {
			type: "organization_mail_blocked",
			subject: blocked.organizationId,
			title: "Organization blocked from emailing new addresses",
			body: `Organization ${blocked.organizationId} crossed the ${blocked.reason} threshold. It stays blocked until an admin clears it on its page in the admin area.`,
		});
	}
}

/** The organization behind the recorded send closest in time to `sentAt`. */
async function senderOf(tx: DbExecutor, recipients: string[], sentAt: Date) {
	const s = unsolicitedMailSend;
	const [send] = await tx
		.select({ organizationId: s.organizationId })
		.from(s)
		.where(
			and(
				inArray(s.email, recipients),
				between(
					s.sentAt,
					new Date(sentAt.getTime() - ATTRIBUTION_WINDOW_MS),
					new Date(sentAt.getTime() + ATTRIBUTION_WINDOW_MS),
				),
			),
		)
		.orderBy(sql`abs(extract(epoch from ${s.sentAt} - ${sentAt.toISOString()}::timestamptz))`)
		.limit(1);
	return send?.organizationId;
}

async function crossedThreshold(
	tx: DbExecutor,
	organizationId: string,
	thresholds: typeof MAIL_REPUTATION,
): Promise<"bounce" | "complaint" | null> {
	const since = new Date(Date.now() - thresholds.windowDays * DAY_MS);
	const [{ bounces, complaints }] = await tx
		.select({
			bounces: sql<number>`count(*) filter (where ${mailEvent.kind} = 'bounce')`.mapWith(Number),
			complaints: sql<number>`count(*) filter (where ${mailEvent.kind} = 'complaint')`.mapWith(
				Number,
			),
		})
		.from(mailEvent)
		.where(and(eq(mailEvent.organizationId, organizationId), gt(mailEvent.receivedAt, since)));
	const [{ sent }] = await tx
		.select({ sent: count() })
		.from(unsolicitedMailSend)
		.where(
			and(
				eq(unsolicitedMailSend.organizationId, organizationId),
				gt(unsolicitedMailSend.sentAt, since),
			),
		);

	const { bounceMin, bouncePercent, complaintMin, complaintPerMille } = thresholds;
	if (complaints >= complaintMin && complaints * 1000 >= sent * complaintPerMille) {
		return "complaint";
	}
	if (bounces >= bounceMin && bounces * 100 >= sent * bouncePercent) return "bounce";
	return null;
}

/** Deletes sends and events past the window. Returns how many. */
export async function pruneMailRecords(db: Db): Promise<number> {
	const cutoff = new Date(Date.now() - MAIL_REPUTATION.windowDays * DAY_MS);
	const events = await db
		.delete(mailEvent)
		.where(lt(mailEvent.receivedAt, cutoff))
		.returning({ id: mailEvent.id });
	const sends = await db
		.delete(unsolicitedMailSend)
		.where(lt(unsolicitedMailSend.sentAt, cutoff))
		.returning({ id: unsolicitedMailSend.id });
	return events.length + sends.length;
}
