import { eq, and, desc, getTableColumns } from "drizzle-orm";
import { nanoid } from "nanoid";

import { m } from "#lib/paraglide/messages.js";
import { db } from "#lib/server/db/index.js";
import { notificationChannel, type NotificationChannel } from "#lib/server/db/schema.js";
import {
	ConfirmationCapError,
	EmailVerificationRequiredError,
	FeatureNotAvailableError,
} from "#lib/server/errors.js";
import { logger } from "#lib/server/logger/index.js";
import { emailChannelService } from "#lib/server/services/email-channel.instance.js";
import type { Requester } from "#lib/server/services/email-channel.service.js";
import type { MailRefusal } from "#lib/server/services/mail-reputation.service.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

/** A channel as members see it. The token would let them confirm an address on its owner's behalf. */
export type ChannelView = Omit<NotificationChannel, "token">;

const { token: _token, ...viewColumns } = getTableColumns(notificationChannel);

const MAIL_REFUSALS: Record<MailRefusal, () => string> = {
	suppressed: m.mail_refused_suppressed,
	blocked: m.mail_refused_blocked,
	ceiling: m.mail_refused_ceiling,
};

const sameAddress = (a: unknown, b: unknown) =>
	typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

/** Until verified, a member can point an email channel at their own address only. */
function assertMaySend(requester: Requester, address: unknown) {
	if (!requester.emailVerified && !sameAddress(address, requester.email)) {
		throw new EmailVerificationRequiredError(
			"Verify your email address to send alerts to someone else's.",
		);
	}
}

export interface CreateChannelInput {
	organizationId: string;
	/** The member saving the channel. */
	requester: Requester;
	name: string;
	type: "email" | "slack" | "discord" | "webhook";
	config: Record<string, unknown>;
	enabled?: boolean;
}

export interface UpdateChannelInput {
	name?: string;
	config?: Record<string, unknown>;
	enabled?: boolean;
}

export class NotificationChannelService {
	async create(input: CreateChannelInput): Promise<ChannelView> {
		// Check if this notification channel type is allowed
		const channelCheck = await subscriptionService.isNotificationChannelAllowed(
			input.organizationId,
			input.type,
		);
		if (!channelCheck.allowed) {
			throw new FeatureNotAvailableError(
				channelCheck.message ?? `${input.type} notifications not available`,
			);
		}

		if (input.type === "email") assertMaySend(input.requester, input.config.email);

		const recipient =
			input.type === "email"
				? await this.recipientFor(input.organizationId, input.config.email)
				: {};
		const id = nanoid();

		const [newChannel] = await db
			.insert(notificationChannel)
			.values({
				id,
				organizationId: input.organizationId,
				name: input.name,
				type: input.type,
				config: input.config,
				enabled: input.enabled ?? true,
				...recipient,
			})
			.returning(viewColumns);

		if (input.type === "email" && !newChannel.unsubscribedAt) {
			await this.queueConfirmation(id, input.organizationId, input.requester);
		}
		return newChannel;
	}

	/**
	 * Recipient fields for a newly set address. Refuses, before anything is saved, an
	 * address that would need a confirmation the organization has no room to send.
	 */
	private async recipientFor(organizationId: string, email: unknown) {
		const address = typeof email === "string" ? email : "";
		const recipient = await emailChannelService.recipientFor(organizationId, address);
		if (recipient.unsubscribedAt) return recipient;

		const refused = await emailChannelService.mailRefusal(organizationId, address);
		if (refused) throw new ConfirmationCapError(MAIL_REFUSALS[refused]());
		if (await emailChannelService.wouldCap(organizationId, address)) {
			throw new ConfirmationCapError(
				"Too many addresses from the past week are still unconfirmed. More can be added as recipients confirm.",
			);
		}
		return recipient;
	}

	/**
	 * A failure here leaves the channel unconfirmed, and the channel list offers a resend,
	 * so it does not fail the save.
	 */
	private async queueConfirmation(
		id: string,
		organizationId: string,
		requester: Requester,
	): Promise<void> {
		try {
			await emailChannelService.queueConfirmation(id, organizationId, requester);
		} catch (error) {
			logger.error({ channel_id: id, error }, "Failed to queue channel confirmation");
		}
	}

	async findByIdAndOrg(id: string, organizationId: string): Promise<ChannelView | null> {
		const [result] = await db
			.select(viewColumns)
			.from(notificationChannel)
			.where(
				and(eq(notificationChannel.id, id), eq(notificationChannel.organizationId, organizationId)),
			)
			.limit(1);

		return result || null;
	}

	async findByOrganization(organizationId: string): Promise<ChannelView[]> {
		return db
			.select(viewColumns)
			.from(notificationChannel)
			.where(eq(notificationChannel.organizationId, organizationId))
			.orderBy(desc(notificationChannel.createdAt));
	}

	/** A new email address starts confirmation over, on behalf of `requester`. */
	async update(
		id: string,
		organizationId: string,
		input: UpdateChannelInput,
		requester?: Requester,
	): Promise<ChannelView | null> {
		const existing = input.config ? await this.findByIdAndOrg(id, organizationId) : null;
		const readdressed =
			existing?.type === "email" && !sameAddress(existing.config.email, input.config?.email);
		if (readdressed && requester) assertMaySend(requester, input.config?.email);
		const recipient = readdressed
			? await this.recipientFor(organizationId, input.config?.email)
			: {};

		const [updated] = await db
			.update(notificationChannel)
			.set({
				...input,
				...recipient,
				updatedAt: new Date(),
			})
			.where(
				and(eq(notificationChannel.id, id), eq(notificationChannel.organizationId, organizationId)),
			)
			.returning(viewColumns);

		if (updated && readdressed && !updated.unsubscribedAt && requester) {
			await this.queueConfirmation(id, organizationId, requester);
		}
		return updated ?? null;
	}

	async delete(id: string, organizationId: string): Promise<boolean> {
		const deleted = await db
			.delete(notificationChannel)
			.where(
				and(eq(notificationChannel.id, id), eq(notificationChannel.organizationId, organizationId)),
			)
			.returning({ id: notificationChannel.id });

		return deleted.length > 0;
	}

	async toggleEnabled(id: string, organizationId: string): Promise<ChannelView | null> {
		const existingChannel = await this.findByIdAndOrg(id, organizationId);
		if (!existingChannel) {
			return null;
		}

		return this.update(id, organizationId, { enabled: !existingChannel.enabled });
	}
}

export const notificationChannelService = new NotificationChannelService();
