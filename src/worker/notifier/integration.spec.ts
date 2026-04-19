import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import {
	monitor as monitorTable,
	monitorNotificationChannel,
	monitorStatus,
	notificationChannel,
	notificationEvent,
	notificationLog,
} from "../../lib/server/db/schema";
import { NotificationService } from "../../lib/server/notifications/service";
import { test } from "../../lib/server/test/fixture";
import { processBacklog } from "./processor";

describe("notifier integration (real Postgres)", () => {
	test("processes a pending event end-to-end, logs per-channel attempts", async ({ db }) => {
		const { db: drizzleDb } = db;

		// Seed an organization (fixture gives an empty migrated DB, no data).
		const orgSuffix = nanoid();
		const orgId = `test-org-${orgSuffix}`;
		await drizzleDb.insert(organization).values({
			id: orgId,
			name: "Test Org",
			slug: `test-org-${orgSuffix}`,
			createdAt: new Date(),
		});

		const monitorId = `test-mon-${nanoid()}`;
		const channelId = `test-ch-${nanoid()}`;
		const eventId = `test-evt-${nanoid()}`;

		await drizzleDb.insert(monitorTable).values({
			id: monitorId,
			organizationId: orgId,
			name: "Test Monitor",
			type: "http",
			url: "https://example.com",
			intervalSeconds: 60,
			timeoutSeconds: 30,
		});
		await drizzleDb.insert(monitorStatus).values({
			monitorId,
			status: "down",
			lastCheckAt: new Date(),
			consecutiveFailures: 1,
		});
		await drizzleDb.insert(notificationChannel).values({
			id: channelId,
			organizationId: orgId,
			name: "Test Webhook",
			type: "webhook",
			// 127.0.0.1:1 refuses the connection immediately — deterministic fast failure
			// without needing a test HTTP server.
			config: { url: "http://127.0.0.1:1/test" },
			enabled: true,
		});
		await drizzleDb.insert(monitorNotificationChannel).values({
			monitorId,
			channelId,
			notifyOnDown: true,
			notifyOnUp: true,
			notifyOnDegraded: false,
			notifyOnSslExpiry: true,
		});
		await drizzleDb.insert(notificationEvent).values({
			id: eventId,
			organizationId: orgId,
			monitorId,
			type: "monitor_down",
			payload: {
				previousStatus: "up",
				newStatus: "down",
				consecutiveFailures: 1,
				checkId: "test-check",
			},
			status: "pending",
		});

		const service = new NotificationService(drizzleDb);
		const processed = await processBacklog(
			drizzleDb,
			"startup",
			// WideEventBuilder requires a real Pino logger — cast to never rather than
			// wiring up the full logging stack in a test.
			() =>
				({
					set: () => {},
					merge: () => {},
					emit: () => {},
					setSuccess: () => {},
					setError: () => {},
				}) as never,
			service,
		);
		expect(processed).toBe(1);

		const [row] = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.id, eventId))
			.limit(1);
		expect(row?.status).toBe("failed");
		expect(row?.processedAt).not.toBeNull();

		const logRows = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.channelId, channelId));
		expect(logRows.length).toBe(1);
		expect(logRows[0]?.status).toBe("failed");

		// No cleanup needed — fixture drops the database on file teardown.
	}, 15_000);
});
