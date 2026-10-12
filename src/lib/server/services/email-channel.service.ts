import { randomBytes } from "node:crypto";

import { and, count, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { CHANNEL_PENDING_CONFIRMATIONS } from "#lib/constants/defaults.js";
import { member, organization, user } from "#lib/server/db/auth-schema.js";
import type { Db, DbExecutor } from "#lib/server/db/index.js";
import { channelConfirmationSend, notificationChannel } from "#lib/server/db/schema.js";
import type { ChannelConfirmation } from "#lib/server/notifications/email.js";

/** How long a confirmation link works. */
export const CONFIRMATION_TTL_HOURS = 48;
const CONFIRMATION_TTL_MS = CONFIRMATION_TTL_HOURS * 60 * 60_000;

/** Minimum gap between confirmation emails for one channel. */
export const RESEND_INTERVAL_MS = 60 * 60_000;

/** How long an unconfirmed send holds a slot under the pending cap. */
export const PENDING_WINDOW_MS = 7 * 24 * 60 * 60_000;

export type ResendResult = "sent" | "confirmed" | "unsubscribed" | "too_soon" | "capped";

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
	 * otherwise emails a confirmation link naming `requestedBy`, the verified account email
	 * of the member asking. An unverified one would let anyone put text of their choosing in
	 * mail to strangers. After an unsubscribe the organization may ask once more, under a
	 * new token so the old links stop working. Null when no such email channel exists.
	 */
	async requestConfirmation(
		channelId: string,
		organizationId: string,
		requestedBy: string | null,
	): Promise<ResendResult | null> {
		const c = notificationChannel;
		const log = channelConfirmationSend;
		const now = new Date();

		const pending = await this.db.transaction(async (tx) => {
			// Serializes requests per organization, so concurrent ones cannot all pass the cap.
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`);

			const [row] = await tx
				.select({
					config: c.config,
					token: c.token,
					confirmationSentAt: c.confirmationSentAt,
					verifiedAt: c.verifiedAt,
					unsubscribedAt: c.unsubscribedAt,
					reaskedAt: c.reaskedAt,
				})
				.from(c)
				.where(and(eq(c.id, channelId), eq(c.organizationId, organizationId), eq(c.type, "email")));
			if (!row?.config.email || !row.token) return null;
			if (row.verifiedAt) return "confirmed";
			if (row.unsubscribedAt && row.reaskedAt) return "unsubscribed";

			if (!row.unsubscribedAt && (await isVerifiedMember(tx, organizationId, row.config.email))) {
				await tx.update(c).set({ verifiedAt: now }).where(eq(c.id, channelId));
				return "confirmed";
			}

			if (
				row.confirmationSentAt &&
				now.getTime() - row.confirmationSentAt.getTime() < RESEND_INTERVAL_MS
			) {
				return "too_soon";
			}

			const [{ unconfirmed }] = await tx
				.select({ unconfirmed: count() })
				.from(log)
				.where(
					and(
						eq(log.organizationId, organizationId),
						gt(log.sentAt, new Date(now.getTime() - PENDING_WINDOW_MS)),
						isNull(log.confirmedAt),
					),
				);
			if (unconfirmed >= this.cap) return "capped";

			const sendId = nanoid();
			const token = row.unsubscribedAt ? freshRecipient().token : row.token;
			const reask = row.unsubscribedAt ? { token, unsubscribedAt: null, reaskedAt: now } : {};
			await tx.insert(log).values({ id: sendId, organizationId, token, sentAt: now });
			await tx
				.update(c)
				.set({ confirmationSentAt: now, ...reask })
				.where(eq(c.id, channelId));
			return { sendId, email: row.config.email, token, unsubscribedAt: row.unsubscribedAt };
		});
		if (pending === null || typeof pending === "string") return pending;

		try {
			await this.sendConfirmation({ email: pending.email, token: pending.token, requestedBy });
		} catch (error) {
			// Nothing went out, so the organization may retry at once and keeps its slot.
			await this.db.transaction(async (tx) => {
				await tx.delete(log).where(eq(log.id, pending.sendId));
				await tx
					.update(c)
					.set({
						confirmationSentAt: null,
						...(pending.unsubscribedAt
							? { unsubscribedAt: pending.unsubscribedAt, reaskedAt: null }
							: {}),
					})
					.where(eq(c.id, channelId));
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
			.returning({ id: c.id });
		if (row) {
			await this.db
				.update(channelConfirmationSend)
				.set({ confirmedAt: now })
				.where(
					and(
						eq(channelConfirmationSend.token, token),
						isNull(channelConfirmationSend.confirmedAt),
					),
				);
		}

		return row !== undefined || (await this.lookup(token))?.state === "confirmed";
	}

	/**
	 * Stops alerts and confirmation emails to the address. The organization may ask once
	 * more; after that, only a new address starts over. Returns what the organization's
	 * admins need to hear about it, or null when nothing changed.
	 */
	async unsubscribe(token: string): Promise<UnsubscribedChannel | null> {
		const c = notificationChannel;
		const [row] = await this.db
			.update(c)
			.set({ verifiedAt: null, unsubscribedAt: new Date() })
			.where(and(eq(c.token, token), isNull(c.unsubscribedAt)))
			.returning({
				organizationId: c.organizationId,
				channelName: c.name,
				config: c.config,
				reaskedAt: c.reaskedAt,
			});
		if (!row?.config.email) return null;

		const [org] = await this.db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, row.organizationId));
		return {
			organizationId: row.organizationId,
			organizationName: org?.name ?? "",
			channelName: row.channelName,
			email: row.config.email,
			final: row.reaskedAt !== null,
		};
	}
}

/** Deletes sends that no longer count toward the pending cap. Returns how many. */
export async function pruneChannelConfirmationSends(db: Db): Promise<number> {
	const deleted = await db
		.delete(channelConfirmationSend)
		.where(lt(channelConfirmationSend.sentAt, new Date(Date.now() - PENDING_WINDOW_MS)))
		.returning({ id: channelConfirmationSend.id });
	return deleted.length;
}
