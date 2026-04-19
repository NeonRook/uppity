import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import {
	incident,
	incidentMonitor,
	incidentUpdate,
	monitor as monitorTable,
	monitorCheck,
	monitorStatus,
	notificationEvent,
	type Monitor,
} from "../../lib/server/db/schema";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { saveCheckResult } from "./check";

async function seedOrganization(drizzleDb: TestDb["db"]): Promise<string> {
	const suffix = nanoid();
	const orgId = `test-org-${suffix}`;
	await drizzleDb.insert(organization).values({
		id: orgId,
		name: `Test Org ${suffix}`,
		slug: `test-org-${suffix}`,
		createdAt: new Date(),
	});
	return orgId;
}

async function seedMonitor(
	drizzleDb: TestDb["db"],
	orgId: string,
	overrides: Partial<typeof monitorTable.$inferInsert> = {},
): Promise<Monitor> {
	const monitorId = `test-mon-${nanoid()}`;
	await drizzleDb.insert(monitorTable).values({
		id: monitorId,
		organizationId: orgId,
		name: "Test Monitor",
		type: "http",
		url: "https://example.com",
		intervalSeconds: 60,
		timeoutSeconds: 30,
		...overrides,
	});
	const [row] = await drizzleDb.select().from(monitorTable).where(eq(monitorTable.id, monitorId));
	if (!row) throw new Error("failed to seed monitor");
	return row;
}

async function waitForNotify(received: string[], expectedId: string, timeoutMs = 2000) {
	const deadline = Date.now() + timeoutMs;
	while (!received.includes(expectedId) && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 10));
	}
}

describe("saveCheckResult", () => {
	test("first check from unknown stays silent: no notification event, no incident", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);

		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "unknown" });

		await saveCheckResult(monitor, { status: "down", responseTimeMs: 42 }, drizzleDb);

		const checks = await drizzleDb
			.select()
			.from(monitorCheck)
			.where(eq(monitorCheck.monitorId, monitor.id));
		expect(checks).toHaveLength(1);
		expect(checks[0]?.status).toBe("down");

		const [status] = await drizzleDb
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, monitor.id));
		expect(status?.status).toBe("down");
		expect(status?.consecutiveFailures).toBe(1);

		const events = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));
		expect(events).toHaveLength(0);

		const incidents = await drizzleDb
			.select()
			.from(incident)
			.where(eq(incident.organizationId, orgId));
		expect(incidents).toHaveLength(0);
	});

	test("up → down enqueues monitor_down, creates an auto-incident, and fires pg_notify", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);

		await drizzleDb.insert(monitorStatus).values({
			monitorId: monitor.id,
			status: "up",
			lastCheckAt: new Date(),
			consecutiveFailures: 0,
		});

		const received: string[] = [];
		const unlisten = await db.listen("notification_event", (payload) => {
			received.push(payload);
		});

		try {
			await saveCheckResult(
				monitor,
				{ status: "down", responseTimeMs: 500, errorMessage: "connection refused" },
				drizzleDb,
			);

			const [event] = await drizzleDb
				.select()
				.from(notificationEvent)
				.where(eq(notificationEvent.monitorId, monitor.id));
			expect(event?.type).toBe("monitor_down");
			expect(event?.status).toBe("pending");

			const payload = event?.payload as {
				previousStatus: string;
				newStatus: string;
				consecutiveFailures: number;
				errorMessage?: string;
				checkId: string;
			};
			expect(payload.previousStatus).toBe("up");
			expect(payload.newStatus).toBe("down");
			expect(payload.consecutiveFailures).toBe(1);
			expect(payload.errorMessage).toBe("connection refused");
			expect(payload.checkId).toEqual(expect.any(String));

			await waitForNotify(received, event.id);
			expect(received).toContain(event.id);

			const [inc] = await drizzleDb
				.select()
				.from(incident)
				.where(eq(incident.organizationId, orgId));
			expect(inc?.isAutoCreated).toBe(true);
			expect(inc?.title).toBe("Test Monitor is down");

			const [link] = await drizzleDb
				.select()
				.from(incidentMonitor)
				.where(eq(incidentMonitor.incidentId, inc.id));
			expect(link?.monitorId).toBe(monitor.id);

			const updates = await drizzleDb
				.select()
				.from(incidentUpdate)
				.where(eq(incidentUpdate.incidentId, inc.id));
			expect(updates).toHaveLength(1);
		} finally {
			await unlisten();
		}
	}, 15_000);

	test("down → down increments consecutiveFailures without a new event or incident", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);

		await drizzleDb.insert(monitorStatus).values({
			monitorId: monitor.id,
			status: "down",
			lastCheckAt: new Date(),
			consecutiveFailures: 1,
		});

		await saveCheckResult(
			monitor,
			{ status: "down", responseTimeMs: 500, errorMessage: "still down" },
			drizzleDb,
		);

		const [status] = await drizzleDb
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, monitor.id));
		expect(status?.status).toBe("down");
		expect(status?.consecutiveFailures).toBe(2);

		const events = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));
		expect(events).toHaveLength(0);

		const incidents = await drizzleDb
			.select()
			.from(incident)
			.where(eq(incident.organizationId, orgId));
		expect(incidents).toHaveLength(0);
	});

	test("down → up enqueues monitor_up and auto-resolves the open incident", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);

		await drizzleDb.insert(monitorStatus).values({
			monitorId: monitor.id,
			status: "down",
			lastCheckAt: new Date(),
			consecutiveFailures: 3,
		});

		const incidentId = `inc-${nanoid()}`;
		await drizzleDb.insert(incident).values({
			id: incidentId,
			organizationId: orgId,
			title: "Test Monitor is down",
			status: "investigating",
			impact: "major",
			isAutoCreated: true,
			startedAt: new Date(),
		});
		await drizzleDb.insert(incidentMonitor).values({ incidentId, monitorId: monitor.id });

		await saveCheckResult(monitor, { status: "up", responseTimeMs: 120 }, drizzleDb);

		const [event] = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));
		expect(event?.type).toBe("monitor_up");
		const payload = event?.payload as {
			previousStatus: string;
			newStatus: string;
			consecutiveFailures: number;
		};
		expect(payload.previousStatus).toBe("down");
		expect(payload.newStatus).toBe("up");
		expect(payload.consecutiveFailures).toBe(0);

		const [resolved] = await drizzleDb.select().from(incident).where(eq(incident.id, incidentId));
		expect(resolved?.status).toBe("resolved");
		expect(resolved?.resolvedAt).not.toBeNull();

		const updates = await drizzleDb
			.select()
			.from(incidentUpdate)
			.where(eq(incidentUpdate.incidentId, incidentId));
		expect(updates).toHaveLength(1);
		expect(updates[0]?.status).toBe("resolved");
	});

	test("SSL expiry inside the threshold enqueues ssl_expiry_warning with daysRemaining", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId, {
			sslCheckEnabled: true,
			sslExpiryThresholdDays: 14,
		});

		await drizzleDb.insert(monitorStatus).values({
			monitorId: monitor.id,
			status: "up",
			lastCheckAt: new Date(),
			consecutiveFailures: 0,
		});

		// Cert expires in ~7 days — inside the 14-day threshold, outside "already expired".
		const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 1000);

		await saveCheckResult(
			monitor,
			{
				status: "up",
				responseTimeMs: 120,
				sslExpiresAt: sevenDaysOut,
				sslIssuer: "Let's Encrypt",
			},
			drizzleDb,
		);

		const events = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));

		const sslEvent = events.find((e) => e.type === "ssl_expiry_warning");
		expect(sslEvent).toBeDefined();

		const payload = sslEvent!.payload as {
			daysRemaining: number;
			sslExpiresAt: string;
			sslIssuer?: string;
		};
		expect(payload.daysRemaining).toBe(7);
		expect(payload.sslIssuer).toBe("Let's Encrypt");
		expect(new Date(payload.sslExpiresAt).getTime()).toBe(sevenDaysOut.getTime());
	});
});
