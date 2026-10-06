import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Logger } from "pino";

import type { Db } from "../db/index";
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
import { sendDiscord } from "./discord";
import { sendEmail } from "./email";
import { parseEventPayload, type IncidentEventPayload } from "./events";
import { sendSlack } from "./slack";
import type { NotificationPayload, NotificationResult, NotificationType } from "./types";
import { sendWebhook } from "./webhook";

export type DispatchResult =
	| { status: "sent" }
	| { status: "failed"; errorMessage: string }
	| { status: "partial"; errorMessage: string }
	| { status: "suppressed"; errorMessage: string };

function send(
	channel: NotificationChannel,
	payload: NotificationPayload,
): Promise<NotificationResult> | null {
	const { config } = channel;
	switch (channel.type) {
		case "email":
			if (config.email) return sendEmail({ email: config.email }, payload);
			break;
		case "slack":
			if (config.webhookUrl) {
				return sendSlack({ webhookUrl: config.webhookUrl, channel: config.channel }, payload);
			}
			break;
		case "discord":
			if (config.discordWebhookUrl) {
				return sendDiscord({ discordWebhookUrl: config.discordWebhookUrl }, payload);
			}
			break;
		case "webhook":
			if (config.url) return sendWebhook({ ...config, url: config.url }, payload);
			break;
	}
	return null;
}

export class NotificationService {
	private db: Db;
	private logger: Logger;

	constructor(db: Db, logger?: Logger) {
		this.db = db;
		this.logger = (logger ?? defaultLogger).child({ context: "notification" });
	}

	private async sendToChannel(
		channel: NotificationChannel,
		payload: NotificationPayload,
		monitorId?: string,
		incidentId?: string,
	): Promise<NotificationResult> {
		const result = (await send(channel, payload)) ?? {
			success: false,
			errorMessage: `No provider configured for channel type: ${channel.type}`,
		};

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
		let parsed: ReturnType<typeof parseEventPayload>;
		try {
			parsed = parseEventPayload(row.type as NotificationType, row.payload);
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
			// parseEventPayload validated against IncidentEventPayload for these types.
			return this.dispatchIncidentEvent(row, parsed as IncidentEventPayload);
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

		return this.fanOut(
			eligible.map(({ channel }) => channel),
			payload,
			row.monitorId,
			row.incidentId ?? undefined,
		);
	}

	private async dispatchIncidentEvent(
		row: NotificationEvent,
		parsed: IncidentEventPayload,
	): Promise<DispatchResult> {
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

		// Fan-out: union of channels linked to any affected monitor, deduplicated, and
		// never outside the incident's organization whatever the links say.
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
					eq(notificationChannel.organizationId, incidentRow.organizationId),
					eq(notificationChannel.enabled, true),
				),
			)
			.where(eq(incidentMonitor.incidentId, row.incidentId));

		let channels: NotificationChannel[] = linked.map((r) => r.channel);

		if (channels.length === 0) {
			// Distinguish two cases:
			//   (a) incident has no linked monitors → component-less broadcast → fall back to all org channels
			//   (b) incident has linked monitors but none have enabled channels → suppress with explicit reason
			// Conflating (b) into (a) would silently widen blast radius for a misconfigured monitor.
			const [hasMonitor] = await this.db
				.select({ monitorId: incidentMonitor.monitorId })
				.from(incidentMonitor)
				.where(eq(incidentMonitor.incidentId, row.incidentId))
				.limit(1);

			if (hasMonitor) {
				return {
					status: "suppressed",
					errorMessage: "linked monitors have no channels configured",
				};
			}

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

		const payload: NotificationPayload = {
			type: row.type as NotificationType,
			incident: incidentRow,
			timestamp: new Date(),
			updateMessage: parsed.updateMessage,
		};

		return this.fanOut(channels, payload, undefined, row.incidentId);
	}

	private async fanOut(
		channels: NotificationChannel[],
		payload: NotificationPayload,
		monitorId?: string,
		incidentId?: string,
	): Promise<DispatchResult> {
		const failures: string[] = [];
		for (const channel of channels) {
			try {
				const result = await this.sendToChannel(channel, payload, monitorId, incidentId);
				if (!result.success) {
					failures.push(`${channel.id}: ${result.errorMessage ?? "delivery failed"}`);
				}
			} catch (err) {
				failures.push(`${channel.id}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		if (failures.length === 0) return { status: "sent" };

		const head = failures.slice(0, 3).join("; ");
		const suffix = failures.length > 3 ? `; +${failures.length - 3} more` : "";
		const errorMessage = `${failures.length}/${channels.length} channels failed: ${head}${suffix}`;
		return { status: failures.length === channels.length ? "failed" : "partial", errorMessage };
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
}
