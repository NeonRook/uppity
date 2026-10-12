import { eq, and, desc, getTableColumns } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "#lib/server/db/index.js";
import { notificationChannel, type NotificationChannel } from "#lib/server/db/schema.js";
import { ConfirmationCapError, FeatureNotAvailableError } from "#lib/server/errors.js";
import { logger } from "#lib/server/logger/index.js";
import { emailChannelService } from "#lib/server/services/email-channel.instance.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

/** A channel as members see it. The token would let them confirm an address on its owner's behalf. */
export type ChannelView = Omit<NotificationChannel, "token">;

const { token: _token, ...viewColumns } = getTableColumns(notificationChannel);

const sameAddress = (a: unknown, b: unknown) =>
	typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

export interface CreateChannelInput {
	organizationId: string;
	/** Verified account email of the member saving the channel, named in the confirmation email. */
	requestedBy: string | null;
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
			await this.requestConfirmation(id, input.organizationId, input.requestedBy);
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
		if (
			!recipient.unsubscribedAt &&
			(await emailChannelService.wouldCap(organizationId, address))
		) {
			throw new ConfirmationCapError(
				"Too many addresses from the past week are still unconfirmed. More can be added as recipients confirm.",
			);
		}
		return recipient;
	}

	/**
	 * A failed send leaves the channel unconfirmed, and the channel list offers a resend,
	 * so it does not fail the save.
	 */
	private async requestConfirmation(
		id: string,
		organizationId: string,
		requestedBy: string | null,
	): Promise<void> {
		try {
			await emailChannelService.requestConfirmation(id, organizationId, requestedBy);
		} catch (error) {
			logger.error({ channel_id: id, error }, "Failed to send channel confirmation");
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

	/** `requestedBy` is named in the confirmation email when the address changes. */
	async update(
		id: string,
		organizationId: string,
		input: UpdateChannelInput,
		requestedBy?: string | null,
	): Promise<ChannelView | null> {
		const existing = input.config ? await this.findByIdAndOrg(id, organizationId) : null;
		const readdressed =
			existing?.type === "email" && !sameAddress(existing.config.email, input.config?.email);
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

		if (updated && readdressed && !updated.unsubscribedAt && requestedBy !== undefined) {
			await this.requestConfirmation(id, organizationId, requestedBy);
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
