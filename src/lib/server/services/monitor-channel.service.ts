import { and, asc, eq, inArray } from "drizzle-orm";

import type { Db, DbExecutor } from "#lib/server/db/index.js";
import { monitor, monitorNotificationChannel, notificationChannel } from "#lib/server/db/schema.js";

export interface MonitorChannelLink {
	channelId: string;
	notifyOnDown: boolean;
	notifyOnUp: boolean;
	notifyOnDegraded: boolean;
	notifyOnSslExpiry: boolean;
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

	/** The organization's channels as a monitor form lists them, without their config. */
	async options(organizationId: string) {
		return this.db
			.select({
				id: notificationChannel.id,
				name: notificationChannel.name,
				type: notificationChannel.type,
				enabled: notificationChannel.enabled,
			})
			.from(notificationChannel)
			.where(eq(notificationChannel.organizationId, organizationId))
			.orderBy(asc(notificationChannel.name));
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
			);
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
}
