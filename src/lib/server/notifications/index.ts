import { db } from "$lib/server/db";
import {
	notificationChannel,
	monitorNotificationChannel,
	notificationLog,
	type NotificationChannel,
	type Monitor,
	type MonitorStatus,
} from "$lib/server/db/schema";
import { logger } from "$lib/server/logger";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import { DiscordNotificationProvider } from "./discord";
import { EmailNotificationProvider } from "./email";
import { SlackNotificationProvider } from "./slack";
import type { NotificationPayload, NotificationProvider, NotificationType } from "./types";
import { WebhookNotificationProvider } from "./webhook";

const notificationLogger = logger.child({ context: "notification" });

export class NotificationService {
	private createProvider(channel: NotificationChannel): NotificationProvider | null {
		const config = channel.config as Record<string, unknown>;

		switch (channel.type) {
			case "email":
				if (config.email) {
					return new EmailNotificationProvider({ email: config.email as string });
				}
				break;
			case "slack":
				if (config.webhookUrl) {
					return new SlackNotificationProvider({
						webhookUrl: config.webhookUrl as string,
						channel: config.channel as string | undefined,
					});
				}
				break;
			case "discord":
				if (config.discordWebhookUrl) {
					return new DiscordNotificationProvider({
						discordWebhookUrl: config.discordWebhookUrl as string,
					});
				}
				break;
			case "webhook":
				if (config.url) {
					return new WebhookNotificationProvider({
						url: config.url as string,
						method: config.method as string | undefined,
						headers: config.headers as Record<string, string> | undefined,
						bodyTemplate: config.bodyTemplate as string | undefined,
					});
				}
				break;
		}

		return null;
	}

	async sendMonitorNotification(
		monitor: Monitor,
		status: MonitorStatus,
		type: NotificationType,
		previousStatus?: string,
		errorMessage?: string,
	): Promise<void> {
		// Get all notification channels linked to this monitor
		const linkedChannels = await db
			.select({
				channel: notificationChannel,
				link: monitorNotificationChannel,
			})
			.from(monitorNotificationChannel)
			.innerJoin(
				notificationChannel,
				eq(monitorNotificationChannel.channelId, notificationChannel.id),
			)
			.where(
				and(
					eq(monitorNotificationChannel.monitorId, monitor.id),
					eq(notificationChannel.enabled, true),
				),
			);

		const payload: NotificationPayload = {
			type,
			monitor,
			status,
			previousStatus,
			errorMessage,
			timestamp: new Date(),
		};

		for (const { channel, link } of linkedChannels) {
			// Check if this channel should receive this notification type
			const shouldNotify = this.shouldNotify(type, link);
			if (!shouldNotify) continue;

			await this.sendToChannel(channel, payload, monitor.id);
		}
	}

	async sendToChannel(
		channel: NotificationChannel,
		payload: NotificationPayload,
		monitorId?: string,
		incidentId?: string,
	): Promise<void> {
		const provider = this.createProvider(channel);
		if (!provider) {
			notificationLogger.error(
				{ channel_id: channel.id, channel_type: channel.type },
				"No provider for channel type",
			);
			return;
		}

		const result = await provider.send(payload);

		// Log the notification attempt
		await db.insert(notificationLog).values({
			id: nanoid(),
			channelId: channel.id,
			monitorId,
			incidentId,
			type: payload.type,
			status: result.success ? "sent" : "failed",
			errorMessage: result.errorMessage,
			sentAt: new Date(),
		});

		if (!result.success) {
			notificationLogger.error(
				{
					channel_id: channel.id,
					channel_type: channel.type,
					notification_type: payload.type,
					error: result.errorMessage,
				},
				"Failed to send notification",
			);
		}
	}

	private shouldNotify(
		type: NotificationType,
		link: {
			notifyOnDown: boolean;
			notifyOnUp: boolean;
			notifyOnDegraded: boolean;
			notifyOnSslExpiry: boolean;
		},
	): boolean {
		switch (type) {
			case "monitor_down":
				return link.notifyOnDown;
			case "monitor_up":
				return link.notifyOnUp;
			case "monitor_degraded":
				return link.notifyOnDegraded;
			case "ssl_expiry_warning":
				return link.notifyOnSslExpiry;
			default:
				return true;
		}
	}

	async sendSslExpiryWarning(
		monitor: Monitor,
		status: MonitorStatus,
		daysRemaining: number,
	): Promise<void> {
		const linkedChannels = await db
			.select({
				channel: notificationChannel,
				link: monitorNotificationChannel,
			})
			.from(monitorNotificationChannel)
			.innerJoin(
				notificationChannel,
				eq(monitorNotificationChannel.channelId, notificationChannel.id),
			)
			.where(
				and(
					eq(monitorNotificationChannel.monitorId, monitor.id),
					eq(notificationChannel.enabled, true),
					eq(monitorNotificationChannel.notifyOnSslExpiry, true),
				),
			);

		const payload: NotificationPayload = {
			type: "ssl_expiry_warning",
			monitor,
			status,
			sslDaysRemaining: daysRemaining,
			timestamp: new Date(),
		};

		for (const { channel } of linkedChannels) {
			await this.sendToChannel(channel, payload, monitor.id);
		}
	}
}

export const notificationService = new NotificationService();
