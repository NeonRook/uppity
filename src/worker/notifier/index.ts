import { setTimeout as sleep } from "node:timers/promises";

import { childLogger, wideEvent, type NotifierWideEvent } from "../../lib/server/logger";
import { NotificationService } from "../../lib/server/notifications/service";
import { client, db } from "../shared/db";
import { processBacklog, processOne } from "./processor";

const BACKLOG_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// Within the platform's stop timeout, so sends in flight finish rather than
// being re-sent by the next sweep.
const SHUTDOWN_GRACE_MS = 20_000;

const consumerLogger = childLogger("consumer");

const newEvent = (id?: string) => wideEvent<NotifierWideEvent>("consumer", "notifier", "ntr", id);
const notificationService = new NotificationService(db, consumerLogger);

let running = true;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let unlisten: (() => Promise<void>) | null = null;
const stopped = Promise.withResolvers<void>();
const inFlight = new Set<Promise<void>>();

function track(work: Promise<void>): void {
	inFlight.add(work);
	void work.finally(() => inFlight.delete(work));
}

async function handleNotification(eventId: string): Promise<void> {
	const event = newEvent(eventId);
	event.set("trigger_source", "listen");
	try {
		await processOne(db, eventId, event, notificationService);
		event.setSuccess();
	} catch (err) {
		consumerLogger.error({ event_id: eventId, error: err }, "Failed to process event");
		event.setError(err);
	} finally {
		event.emit("notifier");
	}
}

async function sweep(trigger: "startup" | "sweep"): Promise<void> {
	try {
		const processed = await processBacklog(db, trigger, newEvent, notificationService);
		if (processed > 0 || trigger === "startup") {
			consumerLogger.info({ processed, trigger }, "Backlog sweep complete");
		}
	} catch (err) {
		consumerLogger.error({ error: err, trigger }, "Backlog sweep failed");
	}
}

function shutdown(signal: string): void {
	consumerLogger.info({ signal }, "Received shutdown signal");
	running = false;
	if (sweepTimer) clearInterval(sweepTimer);
	if (unlisten) void unlisten();
	stopped.resolve();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function start(): Promise<void> {
	consumerLogger.info(
		{ sweep_interval_ms: BACKLOG_SWEEP_INTERVAL_MS },
		"Starting notification worker",
	);

	await sweep("startup");

	// Subscribe to pg_notify channel. Payload is the event row id.
	const subscription = await client.listen("notification_event", (payload) => {
		if (!running) return;
		track(handleNotification(payload));
	});
	unlisten = subscription.unlisten.bind(subscription);

	consumerLogger.info("Listening on channel notification_event");

	sweepTimer = setInterval(() => {
		if (running) track(sweep("sweep"));
	}, BACKLOG_SWEEP_INTERVAL_MS);

	await stopped.promise;
	await Promise.race([Promise.allSettled(inFlight), sleep(SHUTDOWN_GRACE_MS)]);

	consumerLogger.info("Shutdown complete");
	process.exit(0);
}

start().catch((error) => {
	consumerLogger.fatal({ error }, "Fatal error");
	process.exit(1);
});
