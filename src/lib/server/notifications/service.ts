import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import type { Logger } from "pino";

import * as schema from "../db/schema";
import {
	incident,
	incidentMonitor,
	notificationChannel,
	monitorNotificationChannel,
	notificationLog,
	monitor as monitorTable,
	monitorStatus,
	type NotificationChannel,
	type Monitor,
	type MonitorStatus,
	type NotificationEvent,
} from "../db/schema";
import { logger as defaultLogger } from "../logger";
import { DiscordNotificationProvider } from "./discord";
import { EmailNotificationProvider } from "./email";
import { parseEventPayload, type NotificationEventType } from "./events";
import { SlackNotificationProvider } from "./slack";
import type {
	NotificationPayload,
	NotificationProvider,
	NotificationResult,
	NotificationType,
} from "./types";
import { WebhookNotificationProvider } from "./webhook";

type Db = PostgresJsDatabase<typeof schema>;

export type DispatchResult =
	| { status: "sent" }
	| { status: "failed"; errorMessage: string }
	| { status: "partial"; errorMessage: string }
	| { status: "suppressed"; errorMessage: string };

export class NotificationService {
	private db: Db;
	private logger: Logger;

	constructor(db: Db, logger?: Logger) {
		this.db = db;
		this.logger = (logger ?? defaultLogger).child({ context: "notification" });
	}

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
		const linkedChannels = await this.db
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
	): Promise<NotificationResult> {
		const provider = this.createProvider(channel);
		if (!provider) {
			const errorMessage = `No provider configured for channel type: ${channel.type}`;
			this.logger.error(
				{ channel_id: channel.id, channel_type: channel.type },
				"No provider for channel type",
			);
			await this.db.insert(notificationLog).values({
				id: nanoid(),
				channelId: channel.id,
				monitorId,
				incidentId,
				type: payload.type,
				status: "failed",
				errorMessage,
				sentAt: new Date(),
			});
			return { success: false, errorMessage };
		}

		const result = await provider.send(payload);

		await this.db.insert(notificationLog).values({
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
			this.logger.error(
				{
					channel_id: channel.id,
					channel_type: channel.type,
					notification_type: payload.type,
					error: result.errorMessage,
				},
				"Failed to send notification",
			);
		}

		return result;
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

	async dispatchEvent(row: NotificationEvent): Promise<DispatchResult> {
		try {
			parseEventPayload(row.type as NotificationEventType, row.payload);
		} catch (err) {
			return {
				status: "failed",
				errorMessage: `invalid payload: ${err instanceof Error ? err.message : String(err)}`,
			};
		}

		if (
			row.type === "incident_created" ||
			row.type === "incident_updated" ||
			row.type === "incident_resolved"
		) {
			return this.dispatchIncidentEvent(row);
		}

		if (!row.monitorId) {
			return { status: "suppressed", errorMessage: "event has no monitor_id" };
		}

		const [monitor] = await this.db
			.select()
			.from(monitorTable)
			.where(eq(monitorTable.id, row.monitorId))
			.limit(1);
		if (!monitor) {
			return { status: "suppressed", errorMessage: "monitor not found" };
		}

		const [status] = await this.db
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, row.monitorId))
			.limit(1);
		if (!status) {
			return { status: "suppressed", errorMessage: "monitor has no status yet" };
		}

		const links = await this.db
			.select({ channel: notificationChannel, link: monitorNotificationChannel })
			.from(monitorNotificationChannel)
			.innerJoin(
				notificationChannel,
				eq(monitorNotificationChannel.channelId, notificationChannel.id),
			)
			.where(
				and(
					eq(monitorNotificationChannel.monitorId, row.monitorId),
					eq(notificationChannel.enabled, true),
				),
			);

		const type = row.type as NotificationType;
		const eligible = links.filter(({ link }) => this.shouldNotify(type, link));
		if (eligible.length === 0) {
			return {
				status: "suppressed",
				errorMessage:
					links.length === 0
						? "no channels configured"
						: "no channels subscribed to this event type",
			};
		}

		const payload = this.buildNotificationPayload(row, monitor, status);

		const failures: string[] = [];
		let successes = 0;
		for (const { channel } of eligible) {
			try {
				const result = await this.sendToChannel(
					channel,
					payload,
					row.monitorId,
					row.incidentId ?? undefined,
				);
				if (result.success) {
					successes += 1;
				} else {
					failures.push(`${channel.id}: ${result.errorMessage ?? "delivery failed"}`);
				}
			} catch (err) {
				failures.push(`${channel.id}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		if (failures.length === 0) return { status: "sent" };

		const summary = this.summarizeFailures(successes + failures.length, failures);
		if (successes === 0) return { status: "failed", errorMessage: summary };
		return { status: "partial", errorMessage: summary };
	}

	private async dispatchIncidentEvent(row: NotificationEvent): Promise<DispatchResult> {
		if (!row.incidentId) {
			return { status: "suppressed", errorMessage: "event has no incident_id" };
		}

		const [incidentRow] = await this.db
			.select()
			.from(incident)
			.where(eq(incident.id, row.incidentId))
			.limit(1);
		if (!incidentRow) {
			return { status: "suppressed", errorMessage: "incident not found" };
		}

		// Fan-out: union of channels linked to any affected monitor, deduplicated.
		const linked = await this.db
			.selectDistinct({ channel: notificationChannel })
			.from(incidentMonitor)
			.innerJoin(
				monitorNotificationChannel,
				eq(monitorNotificationChannel.monitorId, incidentMonitor.monitorId),
			)
			.innerJoin(
				notificationChannel,
				and(
					eq(notificationChannel.id, monitorNotificationChannel.channelId),
					eq(notificationChannel.enabled, true),
				),
			)
			.where(eq(incidentMonitor.incidentId, row.incidentId));

		let channels: NotificationChannel[] = linked.map((r) => r.channel);

		// Fallback: incident has no linked monitors → notify all enabled org channels.
		if (channels.length === 0) {
			channels = await this.db
				.select()
				.from(notificationChannel)
				.where(
					and(
						eq(notificationChannel.organizationId, incidentRow.organizationId),
						eq(notificationChannel.enabled, true),
					),
				);
		}

		if (channels.length === 0) {
			return { status: "suppressed", errorMessage: "no channels configured" };
		}

		const p = row.payload as { updateId?: string; updateMessage?: string };
		const payload: NotificationPayload = {
			type: row.type as NotificationType,
			incident: incidentRow,
			timestamp: new Date(),
			updateMessage: p.updateMessage,
		};

		const failures: string[] = [];
		let successes = 0;
		for (const channel of channels) {
			try {
				const result = await this.sendToChannel(channel, payload, undefined, row.incidentId);
				if (result.success) successes += 1;
				else failures.push(`${channel.id}: ${result.errorMessage ?? "delivery failed"}`);
			} catch (err) {
				failures.push(`${channel.id}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		if (failures.length === 0) return { status: "sent" };
		const summary = this.summarizeFailures(successes + failures.length, failures);
		if (successes === 0) return { status: "failed", errorMessage: summary };
		return { status: "partial", errorMessage: summary };
	}

	private buildNotificationPayload(
		row: NotificationEvent,
		monitor: Monitor,
		status: MonitorStatus,
	): NotificationPayload {
		const p = row.payload as Record<string, unknown>;
		const type = row.type as NotificationType;
		const base: NotificationPayload = {
			type,
			monitor,
			status,
			timestamp: new Date(),
		};
		if (type === "ssl_expiry_warning") {
			return { ...base, sslDaysRemaining: p.daysRemaining as number };
		}
		return {
			...base,
			previousStatus: p.previousStatus as string | undefined,
			errorMessage: p.errorMessage as string | undefined,
		};
	}

	private summarizeFailures(total: number, failures: string[]): string {
		const head = failures.slice(0, 3).join("; ");
		const suffix = failures.length > 3 ? `; +${failures.length - 3} more` : "";
		return `${failures.length}/${total} channels failed: ${head}${suffix}`;
	}

	async sendSslExpiryWarning(
		monitor: Monitor,
		status: MonitorStatus,
		daysRemaining: number,
	): Promise<void> {
		const linkedChannels = await this.db
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
