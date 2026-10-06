import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "#lib/server/db/index.js";
import { notificationChannel, type NotificationChannel } from "#lib/server/db/schema.js";
import { FeatureNotAvailableError } from "#lib/server/errors.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

export interface CreateChannelInput {
	organizationId: string;
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
	async create(input: CreateChannelInput): Promise<NotificationChannel> {
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
			})
			.returning();

		return newChannel;
	}

	async findByIdAndOrg(id: string, organizationId: string): Promise<NotificationChannel | null> {
		const [result] = await db
			.select()
			.from(notificationChannel)
			.where(
				and(eq(notificationChannel.id, id), eq(notificationChannel.organizationId, organizationId)),
			)
			.limit(1);

		return result || null;
	}

	async findByOrganization(organizationId: string): Promise<NotificationChannel[]> {
		return db
			.select()
			.from(notificationChannel)
			.where(eq(notificationChannel.organizationId, organizationId))
			.orderBy(desc(notificationChannel.createdAt));
	}

	async update(
		id: string,
		organizationId: string,
		input: UpdateChannelInput,
	): Promise<NotificationChannel | null> {
		const [updated] = await db
			.update(notificationChannel)
			.set({
				...input,
				updatedAt: new Date(),
			})
			.where(
				and(eq(notificationChannel.id, id), eq(notificationChannel.organizationId, organizationId)),
			)
			.returning();

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

	async toggleEnabled(id: string, organizationId: string): Promise<NotificationChannel | null> {
		const existingChannel = await this.findByIdAndOrg(id, organizationId);
		if (!existingChannel) {
			return null;
		}

		return this.update(id, organizationId, { enabled: !existingChannel.enabled });
	}
}

export const notificationChannelService = new NotificationChannelService();
