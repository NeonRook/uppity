import { randomBytes } from "node:crypto";

import { and, count, countDistinct, eq, gt, isNotNull, isNull, lt, max, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { CHANNEL_PENDING_CONFIRMATIONS } from "#lib/constants/defaults.js";
import { invitation, member, organization, user } from "#lib/server/db/auth-schema.js";
import type { Db, DbExecutor } from "#lib/server/db/index.js";
import {
	channelConfirmationSend,
	emailOptOut,
	notificationChannel,
} from "#lib/server/db/schema.js";
import type { ChannelConfirmation } from "#lib/server/notifications/email.js";

/** How long a confirmation link works. */
export const CONFIRMATION_TTL_HOURS = 48;
const CONFIRMATION_TTL_MS = CONFIRMATION_TTL_HOURS * 60 * 60_000;

/** Minimum gap between confirmation emails for one channel. */
export const RESEND_INTERVAL_MS = 60 * 60_000;

/** How long an unconfirmed send holds a slot under the pending cap. */
export const PENDING_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * Unanswered emails to one address before an organization may not invite it. The cap counts
 * addresses, so without this, cancelling and re-inviting would mail one person every hour.
 */
export const INVITATION_SENDS_PER_ADDRESS = 3;

export type ResendResult =
	| "sent"
	| "confirmed"
	| "unsubscribed"
	| "reasked"
	| "unverified"
	| "too_soon"
	| "capped";

/** The member asking for a confirmation. */
export interface Requester {
	email: string;
	emailVerified: boolean;
}

export interface RecipientLookup {
	state: "pending" | "confirmed" | "expired" | "unsubscribed";
	/** The organization already asked again after an unsubscribe, so another one is final. */
	reasked: boolean;
	email: string;
	organizationName: string;
}

export interface UnsubscribedChannel {
	organizationId: string;
	organizationName: string;
	channelName: string;
	email: string;
	/** The organization cannot ask this address again. */
	final: boolean;
}

/** The recipient fields of an email channel whose address was just set. */
export function freshRecipient() {
	return {
		token: randomBytes(32).toString("base64url"),
		confirmationSentAt: null,
		verifiedAt: null,
		unsubscribedAt: null,
		reaskedAt: null,
	};
}

async function isVerifiedMember(tx: DbExecutor, organizationId: string, email: string) {
	const [row] = await tx
		.select({ id: member.id })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(user.emailVerified, true),
				sql`lower(${user.email}) = lower(${email})`,
			),
		)
		.limit(1);
	return row !== undefined;
}

const confirmationCutoff = () => new Date(Date.now() - CONFIRMATION_TTL_MS);

/** Consent for email channel addresses that don't belong to a verified member of the organization. */
export class EmailChannelService {
	constructor(
		private db: Db,
		private sendConfirmation: (confirmation: ChannelConfirmation) => Promise<void>,
		private cap = CHANNEL_PENDING_CONFIRMATIONS,
	) {}

	/**
	 * Confirms the channel outright when its address belongs to a verified member, and
	 * otherwise emails a confirmation link naming the requester. A requester whose own
	 * address is unverified sends nothing: anyone can sign up as anyone, so their name for
	 * themselves is text of their choosing. An address that opted out gets one more request,
	 * under a new token so the old links stop working, and nothing after it until it
	 * confirms. Null when no such email channel exists.
	 */
	async requestConfirmation(
		channelId: string,
		organizationId: string,
		requester: Requester,
	): Promise<ResendResult | null> {
		const c = notificationChannel;
		const log = channelConfirmationSend;
		const now = new Date();

		const pending = await this.db.transaction(async (tx) => {
			await lockSends(tx, organizationId);

			const [row] = await tx
				.select({
					config: c.config,
					token: c.token,
					confirmationSentAt: c.confirmationSentAt,
					verifiedAt: c.verifiedAt,
					unsubscribedAt: c.unsubscribedAt,
				})
				.from(c)
				.where(and(eq(c.id, channelId), eq(c.organizationId, organizationId), eq(c.type, "email")));
			if (!row?.config.email) return null;
			if (row.verifiedAt) return "confirmed";
			const email = row.config.email.toLowerCase();

			const optOut = await optOutOf(tx, organizationId, email);
			if (optOut?.reaskedAt) return row.unsubscribedAt ? "unsubscribed" : "reasked";

			if (!optOut && (await isVerifiedMember(tx, organizationId, email))) {
				await tx.update(c).set({ verifiedAt: now }).where(eq(c.id, channelId));
				return "confirmed";
			}
			if (!requester.emailVerified) return "unverified";

			const claim = await claimSlot(tx, organizationId, email, this.cap, now);
			if (claim.refused) return claim.refused;

			// A channel saved without a token, by code older than its column, gets one here.
			const token = optOut || !row.token ? freshRecipient().token : row.token;
			await tx
				.update(c)
				.set({
					token,
					confirmationSentAt: now,
					...(optOut ? { unsubscribedAt: null, reaskedAt: now } : {}),
				})
				.where(eq(c.id, channelId));
			if (optOut) await setReasked(tx, organizationId, email, now);
			return {
				sendId: claim.sendId,
				email: row.config.email,
				token,
				previous: {
					confirmationSentAt: row.confirmationSentAt,
					unsubscribedAt: row.unsubscribedAt,
				},
				reasked: optOut !== undefined,
			};
		});
		if (pending === null || typeof pending === "string") return pending;

		try {
			await this.sendConfirmation({
				email: pending.email,
				token: pending.token,
				requestedBy: requester.email,
			});
		} catch (error) {
			// Nothing went out, so the organization keeps its slot and any earlier link stays valid.
			await this.db.transaction(async (tx) => {
				await tx.delete(log).where(eq(log.id, pending.sendId));
				await tx
					.update(c)
					.set({ ...pending.previous, ...(pending.reasked ? { reaskedAt: null } : {}) })
					.where(eq(c.id, channelId));
				if (pending.reasked) {
					await setReasked(tx, organizationId, pending.email.toLowerCase(), null);
				}
			});
			throw error;
		}
		return "sent";
	}

	/** Null when the token is unknown. */
	async lookup(token: string): Promise<RecipientLookup | null> {
		const c = notificationChannel;
		const [row] = await this.db
			.select({
				config: c.config,
				confirmationSentAt: c.confirmationSentAt,
				verifiedAt: c.verifiedAt,
				unsubscribedAt: c.unsubscribedAt,
				reaskedAt: c.reaskedAt,
				organizationName: organization.name,
			})
			.from(c)
			.innerJoin(organization, eq(organization.id, c.organizationId))
			.where(eq(c.token, token));
		if (!row?.config.email) return null;

		let state: RecipientLookup["state"] = "expired";
		if (row.verifiedAt) state = "confirmed";
		else if (row.unsubscribedAt) state = "unsubscribed";
		else if (row.confirmationSentAt && row.confirmationSentAt > confirmationCutoff())
			state = "pending";
		return {
			state,
			reasked: row.reaskedAt !== null,
			email: row.config.email,
			organizationName: row.organizationName,
		};
	}

	/** Whether the address receives alerts afterwards. Confirming twice is not an error. */
	async confirm(token: string): Promise<boolean> {
		const c = notificationChannel;
		const now = new Date();
		const [row] = await this.db
			.update(c)
			.set({ verifiedAt: now })
			.where(
				and(
					eq(c.token, token),
					isNull(c.verifiedAt),
					isNull(c.unsubscribedAt),
					gt(c.confirmationSentAt, confirmationCutoff()),
				),
			)
			.returning({ organizationId: c.organizationId, config: c.config });
		if (row?.config.email) {
			await markConfirmed(this.db, row.organizationId, row.config.email.toLowerCase(), now);
		}

		return row !== undefined || (await this.lookup(token))?.state === "confirmed";
	}

	/**
	 * Confirms pending channels addressed to `email` in every organization where it belongs
	 * to a verified member. Called once the member verifies it.
	 */
	async confirmMemberAddress(email: string): Promise<void> {
		const c = notificationChannel;
		const address = email.toLowerCase();
		const now = new Date();
		const confirmed = await this.db
			.update(c)
			.set({ verifiedAt: now })
			.where(
				and(
					eq(c.type, "email"),
					isNull(c.verifiedAt),
					isNull(c.unsubscribedAt),
					sql`lower(${c.config}->>'email') = ${address}`,
					sql`${c.organizationId} in (
						select ${member.organizationId} from ${member}
						inner join ${user} on ${user.id} = ${member.userId}
						where ${user.emailVerified} and lower(${user.email}) = ${address}
					)`,
					// Verifying an account is not consent to alerts the address opted out of.
					sql`not exists (
						select 1 from ${emailOptOut}
						where ${emailOptOut.organizationId} = ${c.organizationId}
						and ${emailOptOut.email} = ${address}
						and ${emailOptOut.unsubscribedAt} is not null
					)`,
				),
			)
			.returning({ organizationId: c.organizationId });

		for (const organizationId of new Set(confirmed.map((row) => row.organizationId))) {
			await markConfirmed(this.db, organizationId, address, now);
		}
	}

	/**
	 * Stops alerts and confirmation emails to the address. The organization may ask once
	 * more; after that, only a new address starts over. Returns what the organization's
	 * admins need to hear about it, or null when nothing changed.
	 */
	async unsubscribe(token: string): Promise<UnsubscribedChannel | null> {
		const c = notificationChannel;
		return this.db.transaction(async (tx) => {
			const [row] = await tx
				.select({
					organizationId: c.organizationId,
					channelName: c.name,
					config: c.config,
					reaskedAt: c.reaskedAt,
				})
				.from(c)
				.where(and(eq(c.token, token), isNull(c.unsubscribedAt)));
			if (!row?.config.email) return null;
			const { reaskedAt, organizationName } = await optOutAddress(
				tx,
				row.organizationId,
				row.config.email.toLowerCase(),
				row.reaskedAt,
			);
			return {
				organizationId: row.organizationId,
				organizationName,
				channelName: row.channelName,
				email: row.config.email,
				final: reaskedAt !== null,
			};
		});
	}

	/**
	 * Stops the organization's email to the address an invitation went to. The invitation
	 * itself stands, since declining takes a verified account and it expires on its own. Takes
	 * the invitation id because the email has no other token, and reveals nothing about it.
	 * Returns what the admins need to hear when that stopped an alert channel, otherwise null.
	 */
	async unsubscribeInvitation(invitationId: string): Promise<UnsubscribedChannel | null> {
		return this.db.transaction(async (tx) => {
			const [row] = await tx
				.select({ organizationId: invitation.organizationId, email: invitation.email })
				.from(invitation)
				.where(eq(invitation.id, invitationId));
			if (!row) return null;
			const email = row.email.toLowerCase();
			if (await optOutOf(tx, row.organizationId, email)) return null;

			const { reaskedAt, organizationName, stopped } = await optOutAddress(
				tx,
				row.organizationId,
				email,
				null,
			);
			if (!stopped) return null;
			return {
				organizationId: row.organizationId,
				organizationName,
				channelName: stopped.name,
				email,
				final: reaskedAt !== null,
			};
		});
	}

	/**
	 * Recipient fields for a channel whose address was just set: fresh, unless the address
	 * opted out of this organization's alerts, which the channel then inherits.
	 */
	async recipientFor(organizationId: string, email: string) {
		const [optOut] = await this.db
			.select({ unsubscribedAt: emailOptOut.unsubscribedAt, reaskedAt: emailOptOut.reaskedAt })
			.from(emailOptOut)
			.where(
				and(
					eq(emailOptOut.organizationId, organizationId),
					eq(emailOptOut.email, email.toLowerCase()),
				),
			);
		return { ...freshRecipient(), ...optOut };
	}

	/**
	 * Takes a slot for an invitation email under the same interval and cap as confirmations,
	 * since both go to addresses that never agreed to mail. An address that opted out of the
	 * organization's email gets no invitation either.
	 */
	async claimInvitationSend(organizationId: string, email: string) {
		const address = email.toLowerCase();
		const now = new Date();
		return this.db.transaction(async (tx) => {
			await lockSends(tx, organizationId);
			if (await optOutOf(tx, organizationId, address)) return { refused: "opted_out" as const };
			if (
				(await unansweredSends(tx, organizationId, address, now)) >= INVITATION_SENDS_PER_ADDRESS
			) {
				return { refused: "too_soon" as const };
			}
			return claimSlot(tx, organizationId, address, this.cap, now);
		});
	}

	/** Gives back a slot whose email never went out. */
	async releaseSend(sendId: string): Promise<void> {
		await this.db.delete(channelConfirmationSend).where(eq(channelConfirmationSend.id, sendId));
	}

	/** Frees the address's slot once it accepts an invitation. */
	async markInvitationAccepted(organizationId: string, email: string): Promise<void> {
		await freeSlot(this.db, organizationId, email.toLowerCase(), new Date());
	}

	/** Whether a confirmation to `email` would exceed the organization's pending cap. */
	async wouldCap(organizationId: string, email: string): Promise<boolean> {
		if (await isVerifiedMember(this.db, organizationId, email)) return false;
		return (await unconfirmedAddresses(this.db, organizationId, new Date())) >= this.cap;
	}
}

/** Serializes sends per organization, so concurrent ones cannot all pass the cap. */
async function lockSends(tx: DbExecutor, organizationId: string) {
	await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`);
}

type SlotClaim =
	| { sendId: string; refused?: undefined }
	| { sendId?: undefined; refused: "too_soon" | "capped" };

/** Logs a send to the lowercased address, unless the interval or the cap forbids it. */
async function claimSlot(
	tx: DbExecutor,
	organizationId: string,
	email: string,
	cap: number,
	now: Date,
): Promise<SlotClaim> {
	const log = channelConfirmationSend;
	// Per address, so recreating or readdressing a channel cannot skip the wait.
	const [{ lastSent }] = await tx
		.select({ lastSent: max(log.sentAt) })
		.from(log)
		.where(and(eq(log.organizationId, organizationId), eq(log.email, email)));
	if (lastSent && now.getTime() - lastSent.getTime() < RESEND_INTERVAL_MS) {
		return { refused: "too_soon" };
	}

	if ((await unconfirmedAddresses(tx, organizationId, now)) >= cap) return { refused: "capped" };

	const sendId = nanoid();
	await tx.insert(log).values({ id: sendId, organizationId, email, sentAt: now });
	return { sendId };
}

async function optOutOf(tx: DbExecutor, organizationId: string, email: string) {
	const [row] = await tx
		.select({ reaskedAt: emailOptOut.reaskedAt })
		.from(emailOptOut)
		.where(
			and(
				eq(emailOptOut.organizationId, organizationId),
				eq(emailOptOut.email, email),
				isNotNull(emailOptOut.unsubscribedAt),
			),
		);
	return row;
}

/** Records the address's opt-out and stops every channel the organization points at it. */
async function optOutAddress(
	tx: DbExecutor,
	organizationId: string,
	email: string,
	channelReaskedAt: Date | null,
) {
	const c = notificationChannel;
	const now = new Date();
	const [optOut] = await tx
		.insert(emailOptOut)
		.values({ organizationId, email, unsubscribedAt: now })
		.onConflictDoUpdate({
			target: [emailOptOut.organizationId, emailOptOut.email],
			set: { unsubscribedAt: now },
		})
		.returning({ reaskedAt: emailOptOut.reaskedAt });
	const reaskedAt = channelReaskedAt ?? optOut.reaskedAt;

	const [stopped] = await tx
		.update(c)
		.set({ verifiedAt: null, unsubscribedAt: now, reaskedAt })
		.where(
			and(
				eq(c.organizationId, organizationId),
				eq(c.type, "email"),
				sql`lower(${c.config}->>'email') = ${email}`,
			),
		)
		.returning({ name: c.name });

	const [org] = await tx
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, organizationId));
	return { reaskedAt, organizationName: org?.name ?? "", stopped };
}

function setReasked(tx: DbExecutor, organizationId: string, email: string, at: Date | null) {
	return tx
		.update(emailOptOut)
		.set({ reaskedAt: at })
		.where(and(eq(emailOptOut.organizationId, organizationId), eq(emailOptOut.email, email)));
}

/** Distinct addresses with an unconfirmed send in the pending window. */
async function unconfirmedAddresses(tx: DbExecutor, organizationId: string, now: Date) {
	const log = channelConfirmationSend;
	const [{ unconfirmed }] = await tx
		.select({ unconfirmed: countDistinct(log.email) })
		.from(log)
		.where(
			and(
				eq(log.organizationId, organizationId),
				gt(log.sentAt, new Date(now.getTime() - PENDING_WINDOW_MS)),
				isNull(log.confirmedAt),
			),
		);
	return unconfirmed;
}

/** Unconfirmed sends to one address in the pending window. */
async function unansweredSends(tx: DbExecutor, organizationId: string, email: string, now: Date) {
	const log = channelConfirmationSend;
	const [{ unanswered }] = await tx
		.select({ unanswered: count() })
		.from(log)
		.where(
			and(
				eq(log.organizationId, organizationId),
				eq(log.email, email),
				gt(log.sentAt, new Date(now.getTime() - PENDING_WINDOW_MS)),
				isNull(log.confirmedAt),
			),
		);
	return unanswered;
}

function freeSlot(tx: DbExecutor, organizationId: string, email: string, now: Date) {
	const log = channelConfirmationSend;
	return tx
		.update(log)
		.set({ confirmedAt: now })
		.where(
			and(eq(log.organizationId, organizationId), eq(log.email, email), isNull(log.confirmedAt)),
		);
}

/** Frees the address's slot and lifts its opt-out, keeping the used re-ask. */
async function markConfirmed(tx: DbExecutor, organizationId: string, email: string, now: Date) {
	await freeSlot(tx, organizationId, email, now);
	await tx
		.update(emailOptOut)
		.set({ unsubscribedAt: null })
		.where(and(eq(emailOptOut.organizationId, organizationId), eq(emailOptOut.email, email)));
}

/** Deletes sends that no longer count toward the pending cap. Returns how many. */
export async function pruneChannelConfirmationSends(db: Db): Promise<number> {
	const deleted = await db
		.delete(channelConfirmationSend)
		.where(lt(channelConfirmationSend.sentAt, new Date(Date.now() - PENDING_WINDOW_MS)))
		.returning({ id: channelConfirmationSend.id });
	return deleted.length;
}
