import { createNotifierLogger, createNotifierWideEvent } from "../../lib/server/logger";
import { client, db } from "../shared/db";
import { processBacklog, processOne } from "./processor";

const BACKLOG_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const notifierLogger = createNotifierLogger();

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
		notifierLogger.error({ event_id: eventId, error: err }, "Failed to process event");
		event.setError(err);
	} finally {
		event.emit("notifier");
	}
}

async function runStartupBacklog(): Promise<void> {
	try {
		const processed = await processBacklog(db, "startup", () => createNotifierWideEvent());
		notifierLogger.info({ processed }, "Startup backlog sweep complete");
	} catch (err) {
		notifierLogger.error({ error: err }, "Startup backlog sweep failed");
	}
}

async function runPeriodicSweep(): Promise<void> {
	try {
		const processed = await processBacklog(db, "sweep", () => createNotifierWideEvent());
		if (processed > 0) {
			notifierLogger.info({ processed }, "Periodic sweep processed events");
		}
	} catch (err) {
		notifierLogger.error({ error: err }, "Periodic sweep failed");
	}
}

function shutdown(signal: string): void {
	notifierLogger.info({ signal }, "Received shutdown signal");
	running = false;
	if (sweepTimer) clearInterval(sweepTimer);
	if (unlisten) void unlisten();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function start(): Promise<void> {
	notifierLogger.info(
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

	notifierLogger.info("Listening on channel notification_event");

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

	notifierLogger.info("Shutdown complete");
	process.exit(0);
}

start().catch((error) => {
	notifierLogger.fatal({ error }, "Fatal error");
	process.exit(1);
});
