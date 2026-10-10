import { and, asc, eq, inArray, notInArray } from "drizzle-orm";

import type { ChannelOption } from "#lib/notifications.js";
import { defaultChannelLink, type MonitorChannelLink } from "#lib/schemas/monitor.js";
import type { Db, DbExecutor } from "#lib/server/db/index.js";
import { monitor, monitorNotificationChannel, notificationChannel } from "#lib/server/db/schema.js";
import { monitorsBelongToOrg } from "#lib/server/services/monitor-ownership.js";

export type { MonitorChannelLink };

export interface MonitorChannelSummary extends MonitorChannelLink {
	name: string;
	type: string;
	enabled: boolean;
}

/**
 * Slack and Discord webhook URLs are credentials, so only the parts that
 * identify a destination leave the server: the address, the Slack channel,
 * the webhook host.
 */
function destinationOf(type: string, config: Record<string, unknown>): string | null {
	switch (type) {
		case "email":
			return typeof config.email === "string" ? config.email : null;
		case "slack":
			return typeof config.channel === "string" && config.channel ? `#${config.channel}` : null;
		case "webhook":
			return typeof config.url === "string" && URL.canParse(config.url)
				? new URL(config.url).host
				: null;
		default:
			return null;
	}
}

/** True when every id names a channel owned by `organizationId`. */
export async function channelsBelongToOrg(
	db: Pick<DbExecutor, "select">,
	organizationId: string,
	channelIds: string[],
): Promise<boolean> {
	const unique = [...new Set(channelIds)];
	if (unique.length === 0) return true;
	const found = await db
		.select({ id: notificationChannel.id })
		.from(notificationChannel)
		.where(
			and(
				eq(notificationChannel.organizationId, organizationId),
				inArray(notificationChannel.id, unique),
			),
		);
	return found.length === unique.length;
}

/** Which notification channels a monitor alerts, and for which events. */
export class MonitorChannelService {
	constructor(private readonly db: Db) {}

	/** The organization's channels as a monitor form lists them. */
	async options(organizationId: string): Promise<ChannelOption[]> {
		const rows = await this.db
			.select({
				id: notificationChannel.id,
				name: notificationChannel.name,
				type: notificationChannel.type,
				enabled: notificationChannel.enabled,
				config: notificationChannel.config,
			})
			.from(notificationChannel)
			.where(eq(notificationChannel.organizationId, organizationId))
			.orderBy(asc(notificationChannel.name));
		return rows.map(({ config, ...channel }) =>
			Object.assign(channel, { destination: destinationOf(channel.type, config) }),
		);
	}

	/** What a new monitor starts with: every enabled channel, default events. */
	defaultsFor(options: ChannelOption[]): MonitorChannelLink[] {
		return options.filter((channel) => channel.enabled).map((c) => defaultChannelLink(c.id));
	}

	async list(monitorId: string, organizationId: string): Promise<MonitorChannelLink[]> {
		return this.db
			.select({
				channelId: monitorNotificationChannel.channelId,
				notifyOnDown: monitorNotificationChannel.notifyOnDown,
				notifyOnUp: monitorNotificationChannel.notifyOnUp,
				notifyOnDegraded: monitorNotificationChannel.notifyOnDegraded,
				notifyOnSslExpiry: monitorNotificationChannel.notifyOnSslExpiry,
			})
			.from(monitorNotificationChannel)
			.innerJoin(
				notificationChannel,
				eq(notificationChannel.id, monitorNotificationChannel.channelId),
			)
			.where(
				and(
					eq(monitorNotificationChannel.monitorId, monitorId),
					eq(notificationChannel.organizationId, organizationId),
				),
			)
			.orderBy(asc(notificationChannel.name));
	}

	/** The monitor's links with enough of each channel to name it. */
	async summary(monitorId: string, organizationId: string): Promise<MonitorChannelSummary[]> {
		return this.db
			.select({
				channelId: monitorNotificationChannel.channelId,
				notifyOnDown: monitorNotificationChannel.notifyOnDown,
				notifyOnUp: monitorNotificationChannel.notifyOnUp,
				notifyOnDegraded: monitorNotificationChannel.notifyOnDegraded,
				notifyOnSslExpiry: monitorNotificationChannel.notifyOnSslExpiry,
				name: notificationChannel.name,
				type: notificationChannel.type,
				enabled: notificationChannel.enabled,
			})
			.from(monitorNotificationChannel)
			.innerJoin(
				notificationChannel,
				eq(notificationChannel.id, monitorNotificationChannel.channelId),
			)
			.where(
				and(
					eq(monitorNotificationChannel.monitorId, monitorId),
					eq(notificationChannel.organizationId, organizationId),
				),
			)
			.orderBy(asc(notificationChannel.name));
	}

	/** Ids of the monitors that alert `channelId`. */
	async monitorsFor(channelId: string, organizationId: string): Promise<string[]> {
		const rows = await this.db
			.select({ monitorId: monitorNotificationChannel.monitorId })
			.from(monitorNotificationChannel)
			.innerJoin(monitor, eq(monitor.id, monitorNotificationChannel.monitorId))
			.where(
				and(
					eq(monitorNotificationChannel.channelId, channelId),
					eq(monitor.organizationId, organizationId),
				),
			);
		return rows.map((row) => row.monitorId);
	}

	/**
	 * Replaces the monitor's links with `links`. False, and nothing written, when
	 * the monitor or any channel is outside `organizationId`.
	 */
	async replace(
		monitorId: string,
		organizationId: string,
		links: MonitorChannelLink[],
	): Promise<boolean> {
		const byChannel = new Map(links.map((link) => [link.channelId, link]));

		return this.db.transaction(async (tx) => {
			const [owned] = await tx
				.select({ id: monitor.id })
				.from(monitor)
				.where(and(eq(monitor.id, monitorId), eq(monitor.organizationId, organizationId)));
			if (!owned) return false;

			if (!(await channelsBelongToOrg(tx, organizationId, [...byChannel.keys()]))) {
				return false;
			}

			await tx
				.delete(monitorNotificationChannel)
				.where(eq(monitorNotificationChannel.monitorId, monitorId));
			if (byChannel.size > 0) {
				await tx.insert(monitorNotificationChannel).values(
					[...byChannel.values()].map((link) => ({
						monitorId,
						channelId: link.channelId,
						notifyOnDown: link.notifyOnDown,
						notifyOnUp: link.notifyOnUp,
						notifyOnDegraded: link.notifyOnDegraded,
						notifyOnSslExpiry: link.notifyOnSslExpiry,
					})),
				);
			}
			return true;
		});
	}

	/**
	 * Makes `monitorIds` the monitors that alert `channelId`. Monitors already
	 * attached keep their events; newly attached ones get the defaults. False,
	 * and nothing written, when the channel or any monitor is outside
	 * `organizationId`.
	 */
	async setMonitors(
		channelId: string,
		organizationId: string,
		monitorIds: string[],
	): Promise<boolean> {
		const unique = [...new Set(monitorIds)];

		return this.db.transaction(async (tx) => {
			if (!(await channelsBelongToOrg(tx, organizationId, [channelId]))) return false;
			if (!(await monitorsBelongToOrg(tx, organizationId, unique))) return false;

			await tx
				.delete(monitorNotificationChannel)
				.where(
					and(
						eq(monitorNotificationChannel.channelId, channelId),
						unique.length > 0
							? notInArray(monitorNotificationChannel.monitorId, unique)
							: undefined,
					),
				);
			if (unique.length > 0) {
				await tx
					.insert(monitorNotificationChannel)
					.values(
						unique.map((monitorId) => Object.assign(defaultChannelLink(channelId), { monitorId })),
					)
					.onConflictDoNothing();
			}
			return true;
		});
	}
}
