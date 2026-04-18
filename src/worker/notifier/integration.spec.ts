import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { describe, it, expect } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import * as schema from "../../lib/server/db/schema";
import {
	monitor as monitorTable,
	monitorNotificationChannel,
	monitorStatus,
	notificationChannel,
	notificationEvent,
	notificationLog,
} from "../../lib/server/db/schema";
import { NotificationService } from "../../lib/server/notifications/service";
import { processBacklog } from "./processor";

const { TEST_DATABASE_URL } = process.env;

describe.skipIf(!TEST_DATABASE_URL)("notifier integration (real Postgres)", () => {
	it("processes a pending event end-to-end, logs per-channel attempts", async () => {
		const client = postgres(TEST_DATABASE_URL!);
		const db = drizzle(client, { schema });

		const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
		if (!org) {
			await client.end();
			throw new Error("TEST_DATABASE_URL has no organization rows — seed one first");
		}

		const monitorId = `test-mon-${nanoid()}`;
		const channelId = `test-ch-${nanoid()}`;
		const eventId = `test-evt-${nanoid()}`;

		await db.insert(monitorTable).values({
			id: monitorId,
			organizationId: org.id,
			name: "Test Monitor",
			type: "http",
			url: "https://example.com",
			intervalSeconds: 60,
			timeoutSeconds: 30,
		});
		await db.insert(monitorStatus).values({
			monitorId,
			status: "down",
			lastCheckAt: new Date(),
			consecutiveFailures: 1,
		});
		await db.insert(notificationChannel).values({
			id: channelId,
			organizationId: org.id,
			name: "Test Webhook",
			type: "webhook",
			// 127.0.0.1:1 refuses the connection immediately — deterministic fast failure
			// without needing a test HTTP server.
			config: { url: "http://127.0.0.1:1/neo-29-test" },
			enabled: true,
		});
		await db.insert(monitorNotificationChannel).values({
			monitorId,
			channelId,
			notifyOnDown: true,
			notifyOnUp: true,
			notifyOnDegraded: false,
			notifyOnSslExpiry: true,
		});
		await db.insert(notificationEvent).values({
			id: eventId,
			organizationId: org.id,
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

		const service = new NotificationService(db);
		const processed = await processBacklog(
			db,
			"startup",
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
		expect(processed).toBeGreaterThanOrEqual(1);

		const [row] = await db
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.id, eventId))
			.limit(1);
		// Webhook to 127.0.0.1:1 will fail → event terminal status is 'failed'.
		expect(row?.status).toBe("failed");
		expect(row?.processedAt).not.toBeNull();

		const logRows = await db
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.channelId, channelId));
		expect(logRows.length).toBe(1);
		expect(logRows[0]?.status).toBe("failed");

		// Cleanup in FK-safe order
		await db.delete(notificationLog).where(eq(notificationLog.channelId, channelId));
		await db.delete(notificationEvent).where(eq(notificationEvent.id, eventId));
		await db
			.delete(monitorNotificationChannel)
			.where(eq(monitorNotificationChannel.monitorId, monitorId));
		await db.delete(notificationChannel).where(eq(notificationChannel.id, channelId));
		await db.delete(monitorStatus).where(eq(monitorStatus.monitorId, monitorId));
		await db.delete(monitorTable).where(eq(monitorTable.id, monitorId));
		await client.end();
	}, 15_000);
});
