import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Logger } from "pino";
import * as v from "valibot";

import { redactUrl } from "../api/redact";
import type { Db } from "../db/index";
import {
	incident,
	incidentMonitor,
	notificationChannel,
	monitorNotificationChannel,
	notificationLog,
	monitor as monitorTable,
	monitorStatus,
	type Incident,
	type NotificationChannel,
	type MonitorStatus,
	type NotificationEvent,
} from "../db/schema";
import { logger as defaultLogger } from "../logger";
import { EmailChannelService } from "../services/email-channel.service";
import { sendSubscriberIncidentEmail } from "../subscriber-email";
import { channelConfirmed } from "./confirmed";
import { sendDiscord } from "./discord";
import { sendChannelConfirmation, sendEmail, type ChannelConfirmation } from "./email";
import {
	CHANNEL_CONFIRMATION_EVENT,
	ChannelConfirmationPayload,
	parseEventPayload,
	queuedRetry,
	type DeliveryProgress,
	type IncidentEventPayload,
} from "./events";
import { sendSlack } from "./slack";
import {
	notifyIncidentSubscribers,
	type SendSubscriberIncidentEmail,
	type SubscriberRound,
} from "./subscribers";
import type {
	NotificationPayload,
	NotificationResult,
	NotificationType,
	NotifiedMonitor,
} from "./types";
import { sendWebhook } from "./webhook";

export type DispatchResult =
	| { status: "sent" }
	| { status: "failed" | "partial"; errorMessage: string; retry?: DeliveryProgress }
	| { status: "suppressed"; errorMessage: string };

/** What one delivery attempt at an event came to. */
interface Round {
	reached: boolean;
	rejected: string[];
	transient: string[];
	owed: string[];
}

const NO_CHANNELS: Round = { reached: false, rejected: [], transient: [], owed: [] };

function send(
	channel: NotificationChannel,
	payload: NotificationPayload,
): Promise<NotificationResult> | null {
	const { config } = channel;
	switch (channel.type) {
		case "email":
			if (config.email && channel.token) {
				return sendEmail({ email: config.email, token: channel.token }, payload);
			}
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

/** Summarizes up to three failures, with a count of the rest. */
function summarize(failures: string[], total: number, noun: string): string {
	const head = failures.slice(0, 3).join("; ");
	const suffix = failures.length > 3 ? `; +${failures.length - 3} more` : "";
	return `${failures.length}/${total} ${noun} failed: ${head}${suffix}`;
}

/** Folds subscriber delivery into the channels' round. */
function withSubscribers(channels: Round, subscribers: SubscriberRound | null): Round {
	if (!subscribers) return channels;

	const { sent, failures, retrying } = subscribers;
	const total = sent + failures.length + retrying.length;
	const summary = (some: string[]) =>
		some.length > 0 ? [summarize(some, total, "subscribers")] : [];
	return {
		...channels,
		reached: channels.reached || sent > 0,
		rejected: [...channels.rejected, ...summary(failures)],
		transient: [...channels.transient, ...summary(retrying)],
	};
}

/** Adds a round to the attempts before it. Reaching anyone at all is a partial success. */
function settle(prior: DeliveryProgress | undefined, round: Round): DispatchResult {
	const reached = Boolean(prior?.reached) || round.reached;
	const rejected = [...(prior?.rejected ?? []), ...round.rejected];
	const errors = [...rejected, ...round.transient];
	if (errors.length === 0) return { status: "sent" };

	const result = {
		status: reached ? "partial" : "failed",
		errorMessage: errors.join("; "),
	} as const;
	return round.transient.length > 0
		? { ...result, retry: { owed: round.owed, reached, rejected } }
		: result;
}

export class NotificationService {
	private db: Db;
	private logger: Logger;
	private confirmations: EmailChannelService;

	constructor(
		db: Db,
		logger?: Logger,
		private sendSubscriberEmail: SendSubscriberIncidentEmail = sendSubscriberIncidentEmail,
		sendConfirmation: (c: ChannelConfirmation) => Promise<void> = sendChannelConfirmation,
	) {
		this.db = db;
		this.logger = (logger ?? defaultLogger).child({ context: "notification" });
		this.confirmations = new EmailChannelService(db, sendConfirmation);
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

	/**
	 * A failed send is final rather than left for the sweep: the claim is already undone, and
	 * the channel list offers a resend. The row keeps no SMTP error, which can quote the address.
	 */
	private async dispatchChannelConfirmation(row: NotificationEvent): Promise<DispatchResult> {
		const payload = v.safeParse(ChannelConfirmationPayload, row.payload);
		if (!payload.success) return { status: "failed", errorMessage: "invalid payload" };

		const outcome = await this.confirmations.sendQueued(row.organizationId, payload.output);
		if (outcome === "sent") return { status: "sent" };
		if (outcome === "skipped") {
			return { status: "suppressed", errorMessage: "confirmation no longer due" };
		}
		this.logger.error(
			{ event_id: row.id, error: outcome.failure },
			"Failed to send channel confirmation",
		);
		return { status: "failed", errorMessage: "confirmation email not sent" };
	}

	async dispatchEvent(row: NotificationEvent): Promise<DispatchResult> {
		if (row.type === CHANNEL_CONFIRMATION_EVENT) return this.dispatchChannelConfirmation(row);

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

		// Named columns, so a column added by a migration that has not run yet cannot break dispatch.
		const [monitor] = await this.db
			.select({
				id: monitorTable.id,
				name: monitorTable.name,
				type: monitorTable.type,
				url: monitorTable.url,
				hostname: monitorTable.hostname,
				port: monitorTable.port,
			})
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
					channelConfirmed,
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

		const prior = queuedRetry(row.payload);
		const round = await this.fanOut(
			eligible.map(({ channel }) => channel),
			payload,
			prior,
			row.monitorId,
			row.incidentId ?? undefined,
		);
		return settle(prior, round);
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

		const prior = queuedRetry(row.payload);
		const channels = await this.dispatchIncidentChannels(row, incidentRow, parsed, prior);
		const subscribers = await notifyIncidentSubscribers(
			this.db,
			this.sendSubscriberEmail,
			row.id,
			row.type as "incident_created" | "incident_updated" | "incident_resolved",
			incidentRow,
			parsed.updateMessage,
		);
		if ("status" in channels && !subscribers) return channels;
		return settle(
			prior,
			withSubscribers("status" in channels ? NO_CHANNELS : channels, subscribers),
		);
	}

	private async dispatchIncidentChannels(
		row: NotificationEvent,
		incidentRow: Incident,
		parsed: IncidentEventPayload,
		prior: DeliveryProgress | undefined,
	): Promise<Round | Extract<DispatchResult, { status: "suppressed" }>> {
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
					channelConfirmed,
				),
			)
			.where(eq(incidentMonitor.incidentId, incidentRow.id));

		let channels: NotificationChannel[] = linked.map((r) => r.channel);

		if (channels.length === 0) {
			// Distinguish two cases:
			//   (a) incident has no linked monitors → component-less broadcast → fall back to all org channels
			//   (b) incident has linked monitors but none have enabled channels → suppress with explicit reason
			// Conflating (b) into (a) would silently widen blast radius for a misconfigured monitor.
			const [hasMonitor] = await this.db
				.select({ monitorId: incidentMonitor.monitorId })
				.from(incidentMonitor)
				.where(eq(incidentMonitor.incidentId, incidentRow.id))
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
						channelConfirmed,
					),
				);
		}

		if (channels.length === 0) {
			return { status: "suppressed", errorMessage: "no channels configured" };
		}

		const payload: NotificationPayload = {
			type: row.type as NotificationType,
			incident: incidentRow,
			timestamp: row.createdAt,
			updateMessage: parsed.updateMessage,
		};

		return this.fanOut(channels, payload, prior, undefined, incidentRow.id);
	}

	/** Sends to all at once, so that a hanging channel holds up no other. */
	private async fanOut(
		channels: NotificationChannel[],
		payload: NotificationPayload,
		prior: DeliveryProgress | undefined,
		monitorId?: string,
		incidentId?: string,
	): Promise<Round> {
		const due = prior ? channels.filter((channel) => prior.owed.includes(channel.id)) : channels;
		const results = await Promise.all(
			due.map((channel) =>
				this.sendToChannel(channel, payload, monitorId, incidentId).catch(
					(err: unknown): NotificationResult => ({
						success: false,
						errorMessage: err instanceof Error ? err.message : String(err),
						transient: true,
					}),
				),
			),
		);

		const rejected: string[] = [];
		const transient: string[] = [];
		const owed: string[] = [];
		for (const [i, { id }] of due.entries()) {
			const { success, errorMessage, transient: mayPass } = results[i];
			if (success) continue;
			(mayPass ? transient : rejected).push(`${id}: ${errorMessage ?? "delivery failed"}`);
			if (mayPass) owed.push(id);
		}
		const summary = (some: string[]) =>
			some.length > 0 ? [summarize(some, due.length, "channels")] : [];
		return {
			reached: rejected.length + transient.length < due.length,
			rejected: summary(rejected),
			transient: summary(transient),
			owed,
		};
	}

	private buildNotificationPayload(
		row: NotificationEvent,
		monitor: NotifiedMonitor,
		status: MonitorStatus,
	): NotificationPayload {
		const p = row.payload as Record<string, unknown>;
		const type = row.type as NotificationType;
		const base: NotificationPayload = {
			type,
			// Channels are third-party services. They get the URL without credentials, fragment or
			// query values; a secret in its host or path still reaches them.
			monitor: { ...monitor, url: redactUrl(monitor.url) },
			// Checks stopped, so the recorded status is stale and is not sent.
			status: type === "monitor_checks_stopped" ? undefined : status,
			// A retried alert still says when it happened.
			timestamp: row.createdAt,
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
