import { db } from "$lib/server/db";
import {
	notificationChannel,
	monitorNotificationChannel,
	type NotificationChannel,
} from "$lib/server/db/schema";
import { FeatureNotAvailableError } from "$lib/server/errors";
import { subscriptionService } from "$lib/server/services/subscription.service";
import type { NotificationChannelType } from "$lib/types/plans";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

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

export interface LinkMonitorInput {
	monitorId: string;
	channelId: string;
	notifyOnDown?: boolean;
	notifyOnUp?: boolean;
	notifyOnDegraded?: boolean;
	notifyOnSslExpiry?: boolean;
}

export class NotificationChannelService {
	async create(input: CreateChannelInput): Promise<NotificationChannel> {
		// Check if this notification channel type is allowed
		const channelCheck = await subscriptionService.isNotificationChannelAllowed(
			input.organizationId,
			input.type as NotificationChannelType,
		);
		if (!channelCheck.allowed) {
			throw new FeatureNotAvailableError(
				channelCheck.message ?? `${input.type} notifications not available`,
				`notification:${input.type}`,
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

	async findById(id: string): Promise<NotificationChannel | null> {
		const [result] = await db
			.select()
			.from(notificationChannel)
			.where(eq(notificationChannel.id, id))
			.limit(1);

		return result || null;
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
		const existingChannel = await this.findByIdAndOrg(id, organizationId);
		if (!existingChannel) {
			return null;
		}

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

		return updated || null;
	}

	async delete(id: string, organizationId: string): Promise<boolean> {
		const existingChannel = await this.findByIdAndOrg(id, organizationId);
		if (!existingChannel) {
			return false;
		}

		await db
			.delete(notificationChannel)
			.where(
				and(eq(notificationChannel.id, id), eq(notificationChannel.organizationId, organizationId)),
			);

		return true;
	}

	async toggleEnabled(id: string, organizationId: string): Promise<NotificationChannel | null> {
		const existingChannel = await this.findByIdAndOrg(id, organizationId);
		if (!existingChannel) {
			return null;
		}

		return this.update(id, organizationId, { enabled: !existingChannel.enabled });
	}

	// Link a monitor to a notification channel
	async linkMonitor(input: LinkMonitorInput): Promise<void> {
		await db
			.insert(monitorNotificationChannel)
			.values({
				monitorId: input.monitorId,
				channelId: input.channelId,
				notifyOnDown: input.notifyOnDown ?? true,
				notifyOnUp: input.notifyOnUp ?? true,
				notifyOnDegraded: input.notifyOnDegraded ?? false,
				notifyOnSslExpiry: input.notifyOnSslExpiry ?? true,
			})
			.onConflictDoUpdate({
				target: [monitorNotificationChannel.monitorId, monitorNotificationChannel.channelId],
				set: {
					notifyOnDown: input.notifyOnDown ?? true,
					notifyOnUp: input.notifyOnUp ?? true,
					notifyOnDegraded: input.notifyOnDegraded ?? false,
					notifyOnSslExpiry: input.notifyOnSslExpiry ?? true,
				},
			});
	}

	// Unlink a monitor from a notification channel
	async unlinkMonitor(monitorId: string, channelId: string): Promise<void> {
		await db
			.delete(monitorNotificationChannel)
			.where(
				and(
					eq(monitorNotificationChannel.monitorId, monitorId),
					eq(monitorNotificationChannel.channelId, channelId),
				),
			);
	}

	// Get all channels linked to a monitor
	async getMonitorChannels(monitorId: string): Promise<
		Array<{
			channel: NotificationChannel;
			notifyOnDown: boolean;
			notifyOnUp: boolean;
			notifyOnDegraded: boolean;
			notifyOnSslExpiry: boolean;
		}>
	> {
		const results = await db
			.select({
				channel: notificationChannel,
				notifyOnDown: monitorNotificationChannel.notifyOnDown,
				notifyOnUp: monitorNotificationChannel.notifyOnUp,
				notifyOnDegraded: monitorNotificationChannel.notifyOnDegraded,
				notifyOnSslExpiry: monitorNotificationChannel.notifyOnSslExpiry,
			})
			.from(monitorNotificationChannel)
			.innerJoin(
				notificationChannel,
				eq(monitorNotificationChannel.channelId, notificationChannel.id),
			)
			.where(eq(monitorNotificationChannel.monitorId, monitorId));

		return results;
	}
}

export const notificationChannelService = new NotificationChannelService();
