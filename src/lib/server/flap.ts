import { and, desc, eq, inArray } from "drizzle-orm";

import type { DbExecutor } from "./db/index";
import { notificationEvent } from "./db/schema";
import type { MonitorFlappingEventPayload } from "./notifications/events";
import type { NotificationType } from "./notifications/types";

const STATUS_EVENTS: NotificationType[] = [
	"monitor_down",
	"monitor_up",
	"monitor_degraded",
	"monitor_flapping",
];

/**
 * The flapping message a monitor's alerts are held behind, if any. A monitor is flapping while
 * that message is its newest status event, because ending the hold always enqueues another. The
 * event table needs no migration, so a worker that starts before the web tier's pre-deploy step
 * still reads this.
 */
export async function activeFlap(db: DbExecutor, monitorId: string) {
	const [latest] = await db
		.select({
			type: notificationEvent.type,
			payload: notificationEvent.payload,
			createdAt: notificationEvent.createdAt,
		})
		.from(notificationEvent)
		.where(
			and(
				eq(notificationEvent.monitorId, monitorId),
				inArray(notificationEvent.type, STATUS_EVENTS),
			),
		)
		.orderBy(desc(notificationEvent.createdAt))
		.limit(1);
	if (latest?.type !== "monitor_flapping") return undefined;
	return { notifiedAt: latest.createdAt, ...(latest.payload as MonitorFlappingEventPayload) };
}
