import { and, between, count, eq, gt, inArray, lt, sql } from "drizzle-orm";

import { MAIL_REPUTATION, UNSOLICITED_MAIL_DAILY_CEILING } from "#lib/constants/defaults.js";
import { appUrl } from "#lib/server/account-email.js";
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
	 * the ceiling stays held until it ends, so `record` must follow in that transaction. The
	 * address comes last: a visitor sees "suppressed" as success, so a paused form must look
	 * the same for every address. `visitor` marks an address typed into a public form, which
	 * may use only half the ceiling, so bots cannot spend it all and stop every invitation.
	 */
	async refusal(
		tx: DbExecutor,
		organizationId: string,
		email: string,
		{ visitor = false } = {},
	): Promise<MailRefusal | null> {
		if (await this.isBlocked(tx, organizationId)) return "blocked";
		if (await this.overCeiling(tx, visitor)) return "ceiling";
		return (await this.isSuppressed(tx, email)) ? "suppressed" : null;
	}

	/** Whether a send that passed `refusal` earlier, and already counts, must now stay unsent. */
	async stopped(tx: DbExecutor, organizationId: string, email: string): Promise<boolean> {
		return (await this.isBlocked(tx, organizationId)) || (await this.isSuppressed(tx, email));
	}

	private async isBlocked(tx: DbExecutor, organizationId: string): Promise<boolean> {
		const [block] = await tx
			.select({ organizationId: organizationMailBlock.organizationId })
			.from(organizationMailBlock)
			.where(eq(organizationMailBlock.organizationId, organizationId));
		return block !== undefined;
	}

	private async isSuppressed(tx: DbExecutor, email: string): Promise<boolean> {
		const [suppressed] = await tx
			.select({ email: emailSuppression.email })
			.from(emailSuppression)
			.where(eq(emailSuppression.email, email));
		return suppressed !== undefined;
	}

	private async overCeiling(tx: DbExecutor, visitor: boolean): Promise<boolean> {
		if (this.ceiling <= 0) return false;

		const s = unsolicitedMailSend;
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('unsolicited_mail_ceiling'))`);
		const [{ sent, fromOrganizations }] = await tx
			.select({ sent: count(), fromOrganizations: count(s.organizationId) })
			.from(s)
			.where(gt(s.sentAt, new Date(Date.now() - DAY_MS)));
		const fromVisitors = sent - fromOrganizations;
		if (sent < this.ceiling && !(visitor && fromVisitors * 2 >= this.ceiling)) return false;

		void raiseOpsAlert(this.db, {
			type: "unsolicited_mail_ceiling",
			subject: "instance",
			title: "Unsolicited mail ceiling reached",
			body: `${sent} emails to new addresses went out in the past 24 hours, ${fromVisitors} of them typed into public status pages, which may use half of the ceiling of ${this.ceiling}. Sends are refused until the count drops.`,
		});
		return true;
	}

	async record(
		tx: DbExecutor,
		send: { id: string; organizationId: string | null; email: string },
	): Promise<void> {
		await tx.insert(unsolicitedMailSend).values(send);
	}

	/** Moves a queued send to the moment it leaves, which a bounce is matched against. */
	async stamp(tx: DbExecutor, id: string): Promise<void> {
		await tx
			.update(unsolicitedMailSend)
			.set({ sentAt: new Date() })
			.where(eq(unsolicitedMailSend.id, id));
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

		const organizationId = sentAt && (await senderOf(tx, recipients, sentAt));
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
			body: `Organization ${blocked.organizationId} crossed the ${blocked.reason} threshold. It stays blocked until an admin clears it at ${appUrl}/admin/organizations/${blocked.organizationId}`,
		});
	}
}

/** The organization behind the recorded send closest in time to `sentAt`, if one is accountable. */
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
