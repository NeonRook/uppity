import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, vi } from "vitest";

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
import { EmailChannelService } from "../../lib/server/services/email-channel.service";
import { test } from "../../lib/server/test/fixture";
import { seedOrg } from "../../lib/server/test/seed";
import {
	ALERTS,
	CONFIRMATIONS,
	processBacklog,
	processOne,
	STUCK_ROW_THRESHOLD_MS,
} from "./processor";

// WideEventBuilder requires a real Pino logger — cast to never rather than
// wiring up the full logging stack in a test.
const stubEvent = () =>
	({
		set: () => {},
		merge: () => {},
		emit: () => {},
		setSuccess: () => {},
		setError: () => {},
	}) as never;

type TestDrizzle = Parameters<typeof seedOrg>[0];

async function queueConfirmation(db: TestDrizzle, send: () => Promise<void>) {
	const orgId = await seedOrg(db);
	const channelId = `test-ch-${nanoid()}`;
	await db.insert(notificationChannel).values({
		id: channelId,
		organizationId: orgId,
		name: "Ops",
		type: "email",
		config: { email: "stranger@example.com" },
		token: nanoid(),
	});
	await new EmailChannelService(db, send).queueConfirmation(channelId, orgId, {
		email: "admin@example.com",
		emailVerified: true,
	});
	const [{ id }] = await db
		.select({ id: notificationEvent.id })
		.from(notificationEvent)
		.where(eq(notificationEvent.organizationId, orgId));
	const row = async () =>
		(await db.select().from(notificationEvent).where(eq(notificationEvent.id, id)))[0];
	return { id, row, service: new NotificationService(db, undefined, undefined, send) };
}

describe("confirmation emails in the queue", () => {
	test("the alert sweep leaves them, and their own sweep sends them", async ({ db: { db } }) => {
		const send = vi.fn(async () => {});
		const { row, service } = await queueConfirmation(db, send);

		expect(await processBacklog(db, "sweep", stubEvent, service, ALERTS)).toBe(0);

		expect(send).not.toHaveBeenCalled();
		expect((await row()).status).toBe(CONFIRMATIONS.queued);

		expect(await processBacklog(db, "sweep", stubEvent, service, CONFIRMATIONS)).toBe(1);

		expect(send).toHaveBeenCalledTimes(1);
		expect(await row()).toMatchObject({ status: "sent", payload: {} });
	});

	test("LISTEN claims them in their own lane", async ({ db: { db } }) => {
		const send = vi.fn(async () => {});
		const { id, row, service } = await queueConfirmation(db, send);
		const hung = {
			dispatchEvent: () => Promise.reject(new Error("connection terminated")),
		} as unknown as NotificationService;

		await expect(processOne(db, id, undefined, hung)).rejects.toThrow("connection terminated");
		expect((await row()).status).toBe(CONFIRMATIONS.claimed);

		await db
			.update(notificationEvent)
			.set({ claimedAt: new Date(Date.now() - STUCK_ROW_THRESHOLD_MS - 1000) })
			.where(eq(notificationEvent.id, id));
		expect(await processBacklog(db, "sweep", stubEvent, service, ALERTS)).toBe(0);
		expect(await processBacklog(db, "sweep", stubEvent, service, CONFIRMATIONS)).toBe(1);
		expect(send).toHaveBeenCalledTimes(1);
	});
});

describe("LISTEN with an alert", () => {
	test("claims it as processing and writes its terminal status", async ({ db: { db } }) => {
		const orgId = await seedOrg(db);
		const id = `test-evt-${nanoid()}`;
		await db.insert(notificationEvent).values({
			id,
			organizationId: orgId,
			type: "monitor_down",
			payload: { previousStatus: "up", newStatus: "down", consecutiveFailures: 1, checkId: "c" },
		});
		const row = async () =>
			(await db.select().from(notificationEvent).where(eq(notificationEvent.id, id)))[0];
		const seen: string[] = [];
		const service = {
			dispatchEvent: async () => {
				seen.push((await row()).status);
				return { status: "sent" };
			},
		} as unknown as NotificationService;

		await processOne(db, id, undefined, service);
		await processOne(db, id, undefined, service);

		expect(seen).toEqual([ALERTS.claimed]);
		expect(await row()).toMatchObject({ status: "sent", payload: { checkId: "c" } });
	});
});

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
			// A private address is refused before connecting, a final failure that needs no
			// test HTTP server.
			config: { url: "http://127.0.0.1:8080/test" },
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
		const processed = await processBacklog(drizzleDb, "startup", stubEvent, service);
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

	test("an event whose dispatch throws is retried by a later sweep, not failed", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = `test-org-${nanoid()}`;
		await drizzleDb
			.insert(organization)
			.values({ id: orgId, name: "Test Org", slug: orgId, createdAt: new Date() });
		const eventId = `test-evt-${nanoid()}`;
		await drizzleDb.insert(notificationEvent).values({
			id: eventId,
			organizationId: orgId,
			type: "monitor_down",
			payload: { previousStatus: "up", newStatus: "down", consecutiveFailures: 1, checkId: "c" },
			status: "pending",
		});
		const status = async () =>
			(
				await drizzleDb
					.select({ status: notificationEvent.status })
					.from(notificationEvent)
					.where(eq(notificationEvent.id, eventId))
			)[0].status;

		const broken = {
			dispatchEvent: () => Promise.reject(new Error("connection terminated")),
		} as unknown as NotificationService;
		await processBacklog(drizzleDb, "sweep", stubEvent, broken);
		expect(await status()).toBe("processing");

		// The claim goes stale, and the next sweep dispatches the event again.
		await drizzleDb
			.update(notificationEvent)
			.set({ claimedAt: new Date(Date.now() - STUCK_ROW_THRESHOLD_MS - 1000) })
			.where(eq(notificationEvent.id, eventId));
		await processBacklog(drizzleDb, "sweep", stubEvent, new NotificationService(drizzleDb));
		// No monitor on the row, so the real service settles it as suppressed.
		expect(await status()).toBe("suppressed");
	});
});
