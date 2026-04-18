import { createConsumerLogger, createNotifierWideEvent } from "../../lib/server/logger";
import { client, db } from "../shared/db";
import { processBacklog, processOne } from "./processor";

const BACKLOG_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const consumerLogger = createConsumerLogger();

let running = true;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let unlisten: (() => Promise<void>) | null = null;

async function handleNotification(eventId: string): Promise<void> {
	const event = createNotifierWideEvent(eventId);
	event.set("trigger_source", "listen");
	try {
		await processOne(db, eventId, event);
		event.setSuccess();
	} catch (err) {
		consumerLogger.error({ event_id: eventId, error: err }, "Failed to process event");
		event.setError(err);
	} finally {
		event.emit("notifier");
	}
}

async function runStartupBacklog(): Promise<void> {
	try {
		const processed = await processBacklog(db, "startup", () => createNotifierWideEvent());
		consumerLogger.info({ processed }, "Startup backlog sweep complete");
	} catch (err) {
		consumerLogger.error({ error: err }, "Startup backlog sweep failed");
	}
}

async function runPeriodicSweep(): Promise<void> {
	try {
		const processed = await processBacklog(db, "sweep", () => createNotifierWideEvent());
		if (processed > 0) {
			consumerLogger.info({ processed }, "Periodic sweep processed events");
		}
	} catch (err) {
		consumerLogger.error({ error: err }, "Periodic sweep failed");
	}
}

function shutdown(signal: string): void {
	consumerLogger.info({ signal }, "Received shutdown signal");
	running = false;
	if (sweepTimer) clearInterval(sweepTimer);
	if (unlisten) void unlisten();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function start(): Promise<void> {
	consumerLogger.info(
		{ sweep_interval_ms: BACKLOG_SWEEP_INTERVAL_MS },
		"Starting notification worker",
	);

	await runStartupBacklog();

	// Subscribe to pg_notify channel. Payload is the event row id.
	const subscription = await client.listen("notification_event", (payload) => {
		if (!running) return;
		void handleNotification(payload);
	});
	unlisten = subscription.unlisten.bind(subscription);

	consumerLogger.info("Listening on channel notification_event");

	sweepTimer = setInterval(() => {
		if (running) void runPeriodicSweep();
	}, BACKLOG_SWEEP_INTERVAL_MS);

	// Keep alive until shutdown
	await new Promise<void>((resolve) => {
		const checkInterval = setInterval(() => {
			if (!running) {
				clearInterval(checkInterval);
				resolve();
			}
		}, 1000);
	});

	consumerLogger.info("Shutdown complete");
	process.exit(0);
}

start().catch((error) => {
	consumerLogger.fatal({ error }, "Fatal error");
	process.exit(1);
});
