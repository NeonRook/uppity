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

function newestEvent(db: DbExecutor, monitorId: string, types: NotificationType[]) {
	return db
		.select({
			type: notificationEvent.type,
			payload: notificationEvent.payload,
			createdAt: notificationEvent.createdAt,
		})
		.from(notificationEvent)
		.where(and(eq(notificationEvent.monitorId, monitorId), inArray(notificationEvent.type, types)))
		.orderBy(desc(notificationEvent.createdAt))
		.limit(1);
}

const OUTAGE_EVENTS: NotificationType[] = ["monitor_down", "monitor_up", "monitor_flapping"];

/**
 * The flapping message a monitor's alerts are held behind, if any. A monitor is flapping while
 * that message is its newest status event, because ending the hold always enqueues another. The
 * event table needs no migration, so a worker that starts before the web tier's pre-deploy step
 * still reads this.
 */
export async function activeFlap(db: DbExecutor, monitorId: string) {
	const [latest] = await newestEvent(db, monitorId, STATUS_EVENTS);
	if (latest?.type !== "monitor_flapping") return undefined;
	return { notifiedAt: latest.createdAt, ...(latest.payload as MonitorFlappingEventPayload) };
}

/**
 * Whether people were told of an outage and have not had its recovery alert. A flapping message
 * counts, because it stands in for the down alert. Degraded alerts do not end an outage.
 */
export async function outageAlerted(db: DbExecutor, monitorId: string): Promise<boolean> {
	const [latest] = await newestEvent(db, monitorId, OUTAGE_EVENTS);
	return latest !== undefined && latest.type !== "monitor_up";
}
