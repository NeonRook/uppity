import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import {
	incident,
	incidentMonitor,
	incidentUpdate,
	maintenanceWindow,
	maintenanceWindowMonitor,
	monitor as monitorTable,
	monitorCheck,
	monitorStatus,
	notificationEvent,
	type Monitor,
} from "../../lib/server/db/schema";
import { IncidentService } from "../../lib/server/services/incident.service";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { insertResult, type CheckResult } from "./check";
import { pendingMonitorIds, processResults } from "./processor";

/** Records a result the way a probe does, then runs the processor over it. */
async function save(drizzleDb: TestDb["db"], monitor: Monitor, result: CheckResult) {
	await insertResult(drizzleDb, monitor.id, result);
	await processResults(drizzleDb, monitor.id);
}

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

async function seedActiveMaintenanceWindow(
	drizzleDb: TestDb["db"],
	orgId: string,
	monitorId: string,
): Promise<string> {
	const id = `mw-${nanoid()}`;
	await drizzleDb.insert(maintenanceWindow).values({
		id,
		organizationId: orgId,
		name: "Active window",
		status: "in_progress",
		startsAt: new Date(Date.now() - 60_000),
		endsAt: new Date(Date.now() + 60_000),
	});
	await drizzleDb.insert(maintenanceWindowMonitor).values({ windowId: id, monitorId });
	return id;
}

async function waitForNotify(received: string[], expectedId: string, timeoutMs = 2000) {
	const deadline = Date.now() + timeoutMs;
	while (!received.includes(expectedId) && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 10));
	}
}

async function eventTypes(drizzleDb: TestDb["db"], monitorId: string): Promise<string[]> {
	const rows = await drizzleDb
		.select({ type: notificationEvent.type })
		.from(notificationEvent)
		.where(eq(notificationEvent.monitorId, monitorId));
	return rows.map((row) => row.type);
}

describe("processResults", () => {
	test("first check from unknown that is up stays silent", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "unknown" });

		await save(drizzleDb, monitor, { status: "up", responseTimeMs: 42 });

		expect(await eventTypes(drizzleDb, monitor.id)).toEqual([]);
	});

	test("a monitor down from its first check alerts and opens an incident", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "unknown" });

		await save(drizzleDb, monitor, { status: "down", responseTimeMs: 42 });

		expect(await eventTypes(drizzleDb, monitor.id)).toEqual(["monitor_down"]);
		expect(
			await drizzleDb.select().from(incident).where(eq(incident.organizationId, orgId)),
		).toHaveLength(1);
	});

	test("alerts once, on the failure that reaches the threshold", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId, { alertAfterFailures: 2 });
		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "up" });
		const down = { status: "down", responseTimeMs: 42 } as const;

		await save(drizzleDb, monitor, down);
		expect(await eventTypes(drizzleDb, monitor.id)).toEqual([]);

		await save(drizzleDb, monitor, down);
		await save(drizzleDb, monitor, down);
		expect(await eventTypes(drizzleDb, monitor.id)).toEqual(["monitor_down"]);
	});

	test("recovery from a blip below the threshold stays silent", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId, { alertAfterFailures: 2 });
		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "up" });

		await save(drizzleDb, monitor, { status: "down", responseTimeMs: 42 });
		await save(drizzleDb, monitor, { status: "up", responseTimeMs: 42 });

		expect(await eventTypes(drizzleDb, monitor.id)).toEqual([]);
	});

	for (const status of ["resolved", "postmortem"]) {
		test(`a ${status} incident does not stop the next outage opening one`, async ({ db }) => {
			const { db: drizzleDb } = db;
			const orgId = await seedOrganization(drizzleDb);
			const monitor = await seedMonitor(drizzleDb, orgId);
			await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "up" });
			const old = `inc-${nanoid()}`;
			await drizzleDb.insert(incident).values({
				id: old,
				organizationId: orgId,
				title: "Earlier outage",
				status,
				impact: "major",
				isAutoCreated: true,
				startedAt: new Date(),
			});
			await drizzleDb.insert(incidentMonitor).values({ incidentId: old, monitorId: monitor.id });

			await save(drizzleDb, monitor, { status: "down", responseTimeMs: 42 });

			const open = await drizzleDb
				.select()
				.from(incident)
				.where(and(eq(incident.organizationId, orgId), eq(incident.status, "investigating")));
			expect(open).toHaveLength(1);
		});
	}

	test("an outage after a postmortem runs its own incident and leaves the old one closed", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "up" });

		await save(drizzleDb, monitor, { status: "down", responseTimeMs: 42 });
		await save(drizzleDb, monitor, { status: "up", responseTimeMs: 42 });
		const [first] = await drizzleDb
			.select()
			.from(incident)
			.where(eq(incident.organizationId, orgId));
		await new IncidentService(drizzleDb).addUpdate({
			incidentId: first.id,
			organizationId: orgId,
			status: "postmortem",
			message: "What we learned",
		});

		await save(drizzleDb, monitor, { status: "down", responseTimeMs: 42 });
		await save(drizzleDb, monitor, { status: "up", responseTimeMs: 42 });

		const rows = await drizzleDb.select().from(incident).where(eq(incident.organizationId, orgId));
		const second = rows.find((row) => row.id !== first.id);
		expect(second?.status).toBe("resolved");
		expect(second?.resolvedAt).not.toBeNull();
		const closed = rows.find((row) => row.id === first.id);
		expect(closed?.status).toBe("postmortem");
		expect(closed?.resolvedAt).toEqual(first.resolvedAt);
		expect((await eventTypes(drizzleDb, monitor.id)).toSorted()).toEqual([
			"monitor_down",
			"monitor_down",
			"monitor_up",
			"monitor_up",
		]);
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
			await save(drizzleDb, monitor, {
				status: "down",
				responseTimeMs: 500,
				errorMessage: "connection refused",
			});

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
			expect(updates).toMatchObject([{ message: "Monitor is not responding." }]);
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

		await save(drizzleDb, monitor, {
			status: "down",
			responseTimeMs: 500,
			errorMessage: "still down",
		});

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

		await save(drizzleDb, monitor, { status: "up", responseTimeMs: 120 });

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

	test("down → up does not resolve a manual incident, only enqueues monitor_up", async ({ db }) => {
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
			title: "Manually filed incident",
			status: "investigating",
			impact: "major",
			isAutoCreated: false,
			startedAt: new Date(),
		});
		await drizzleDb.insert(incidentMonitor).values({ incidentId, monitorId: monitor.id });

		await save(drizzleDb, monitor, { status: "up", responseTimeMs: 120 });

		const [event] = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));
		expect(event?.type).toBe("monitor_up");

		const [stillOpen] = await drizzleDb.select().from(incident).where(eq(incident.id, incidentId));
		expect(stillOpen?.status).toBe("investigating");
		expect(stillOpen?.resolvedAt).toBeNull();

		const updates = await drizzleDb
			.select()
			.from(incidentUpdate)
			.where(eq(incidentUpdate.incidentId, incidentId));
		expect(updates).toHaveLength(0);
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

		await save(drizzleDb, monitor, {
			status: "up",
			responseTimeMs: 120,
			sslExpiresAt: sevenDaysOut,
			sslIssuer: "Let's Encrypt",
		});

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

	test("SSL warning is suppressed when a prior warning is inside the cooldown window", async ({
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

		// Seed a recent ssl_expiry_warning event for this monitor (6h ago, well inside 24h cooldown).
		const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
		await drizzleDb.insert(notificationEvent).values({
			id: `notif-${nanoid()}`,
			organizationId: orgId,
			monitorId: monitor.id,
			type: "ssl_expiry_warning",
			payload: { daysRemaining: 8, sslExpiresAt: new Date().toISOString() },
			status: "sent",
			createdAt: sixHoursAgo,
		});

		const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 1000);
		await save(drizzleDb, monitor, {
			status: "up",
			responseTimeMs: 120,
			sslExpiresAt: sevenDaysOut,
		});

		const events = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));
		const sslEvents = events.filter((e) => e.type === "ssl_expiry_warning");
		// Still just the one we seeded — the new check should have been suppressed by cooldown.
		expect(sslEvents).toHaveLength(1);
	});

	test("SSL warning fires again after the cooldown window has elapsed", async ({ db }) => {
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

		// Prior warning is older than the 24h cooldown — should not suppress.
		const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
		await drizzleDb.insert(notificationEvent).values({
			id: `notif-${nanoid()}`,
			organizationId: orgId,
			monitorId: monitor.id,
			type: "ssl_expiry_warning",
			payload: { daysRemaining: 9, sslExpiresAt: new Date().toISOString() },
			status: "sent",
			createdAt: twoDaysAgo,
		});

		const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 1000);
		await save(drizzleDb, monitor, {
			status: "up",
			responseTimeMs: 120,
			sslExpiresAt: sevenDaysOut,
		});

		const events = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));
		const sslEvents = events.filter((e) => e.type === "ssl_expiry_warning");
		expect(sslEvents).toHaveLength(2);
	});

	test("monitor_down during active maintenance does NOT enqueue an event or create an incident", async ({
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

		await seedActiveMaintenanceWindow(drizzleDb, orgId, monitor.id);

		await save(drizzleDb, monitor, {
			status: "down",
			responseTimeMs: 500,
			errorMessage: "connection refused",
		});

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

	test("monitor recovery during active maintenance does NOT enqueue monitor_up or auto-resolve", async ({
		db,
	}) => {
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

		await seedActiveMaintenanceWindow(drizzleDb, orgId, monitor.id);

		await save(drizzleDb, monitor, { status: "up", responseTimeMs: 120 });

		const events = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));
		expect(events).toHaveLength(0);

		const [stillOpen] = await drizzleDb.select().from(incident).where(eq(incident.id, incidentId));
		expect(stillOpen?.status).toBe("investigating");
		expect(stillOpen?.resolvedAt).toBeNull();
	});

	test("monitor_check row is still recorded during active maintenance", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);

		await drizzleDb.insert(monitorStatus).values({
			monitorId: monitor.id,
			status: "up",
			lastCheckAt: new Date(),
			consecutiveFailures: 0,
		});

		await seedActiveMaintenanceWindow(drizzleDb, orgId, monitor.id);

		await save(drizzleDb, monitor, {
			status: "down",
			responseTimeMs: 500,
			errorMessage: "connection refused",
		});

		const checks = await drizzleDb
			.select()
			.from(monitorCheck)
			.where(eq(monitorCheck.monitorId, monitor.id));
		expect(checks).toHaveLength(1);
		expect(checks[0]?.status).toBe("down");
	});

	test("monitor_status is NOT updated during active maintenance (frozen for post-window detection)", async ({
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
		await seedActiveMaintenanceWindow(drizzleDb, orgId, monitor.id);

		await save(drizzleDb, monitor, {
			status: "down",
			responseTimeMs: 500,
			errorMessage: "connection refused",
		});

		const [status] = await drizzleDb
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, monitor.id));
		// monitor_status remains frozen at its pre-window state so the next
		// post-window check can detect the transition.
		expect(status?.status).toBe("up");
		expect(status?.consecutiveFailures).toBe(0);
	});

	test("monitor down during maintenance and still down after creates an incident on first post-window check", async ({
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

		// 1) seed an ALREADY-EXPIRED window — startsAt past, endsAt past
		// The window represents "monitoring was paused for the last hour, just resumed."
		const wId = `mw-${nanoid()}`;
		await drizzleDb.insert(maintenanceWindow).values({
			id: wId,
			organizationId: orgId,
			name: "Past window",
			status: "completed",
			startsAt: new Date(Date.now() - 3_600_000),
			endsAt: new Date(Date.now() - 60_000),
		});
		await drizzleDb.insert(maintenanceWindowMonitor).values({
			windowId: wId,
			monitorId: monitor.id,
		});

		// 2) Now a check comes in showing the monitor went down.
		// The gate should NOT fire (window status is 'completed', not 'in_progress').
		// monitor_status moves up→down. statusChanged=true. Incident created.
		await save(drizzleDb, monitor, {
			status: "down",
			responseTimeMs: 500,
			errorMessage: "timeout",
		});

		const incidents = await drizzleDb
			.select()
			.from(incident)
			.where(eq(incident.organizationId, orgId));
		expect(incidents).toHaveLength(1);
		expect(incidents[0].isAutoCreated).toBe(true);

		const events = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.monitorId, monitor.id));
		expect(events.some((e) => e.type === "monitor_down")).toBe(true);
	});

	test("SSL expiry warnings still fire during active maintenance", async ({ db }) => {
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
		await seedActiveMaintenanceWindow(drizzleDb, orgId, monitor.id);

		const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 1000);

		await save(drizzleDb, monitor, {
			status: "up",
			responseTimeMs: 120,
			sslExpiresAt: sevenDaysOut,
			sslIssuer: "Let's Encrypt",
		});

		const sslEvents = await drizzleDb
			.select()
			.from(notificationEvent)
			.where(
				and(
					eq(notificationEvent.monitorId, monitor.id),
					eq(notificationEvent.type, "ssl_expiry_warning"),
				),
			);
		expect(sslEvents).toHaveLength(1);
	});

	test("stamps the status change only when the status changes", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const earlier = new Date("2026-01-01T00:00:00Z");
		const recovering = await seedMonitor(drizzleDb, orgId);
		const steady = await seedMonitor(drizzleDb, orgId);
		for (const [m, status] of [
			[recovering, "down"],
			[steady, "up"],
		] as const) {
			await drizzleDb
				.insert(monitorStatus)
				.values({ monitorId: m.id, status, lastStatusChange: earlier, lastCheckAt: earlier });
			await save(drizzleDb, m, { status: "up", responseTimeMs: 0 });
		}

		const stamp = async (m: Monitor) => {
			const [row] = await drizzleDb
				.select()
				.from(monitorStatus)
				.where(eq(monitorStatus.monitorId, m.id));
			return row.lastStatusChange!.getTime();
		};
		expect(await stamp(recovering)).toBeGreaterThan(earlier.getTime());
		expect(await stamp(steady)).toBe(earlier.getTime());
	});

	test("interprets each row once, however many processors see it", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "up" });

		await insertResult(drizzleDb, monitor.id, { status: "down", responseTimeMs: 1 });
		const counts = await Promise.all([
			processResults(drizzleDb, monitor.id),
			processResults(drizzleDb, monitor.id),
			processResults(drizzleDb, monitor.id),
		]);
		expect(counts.toSorted((a, b) => a - b)).toEqual([0, 0, 1]);
		expect(await processResults(drizzleDb, monitor.id)).toBe(0);

		expect(await eventTypes(drizzleDb, monitor.id)).toEqual(["monitor_down"]);
		const [status] = await drizzleDb
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, monitor.id));
		expect(status.consecutiveFailures).toBe(1);
	});

	test("interprets waiting rows oldest first", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "up" });
		const now = Date.now();

		// Inserted newest first; the down → up order is what alerts.
		await insertResult(drizzleDb, monitor.id, { status: "up", responseTimeMs: 1 }, new Date(now));
		await insertResult(
			drizzleDb,
			monitor.id,
			{ status: "down", responseTimeMs: 1 },
			new Date(now - 1000),
		);
		expect(await processResults(drizzleDb, monitor.id)).toBe(2);

		expect(await eventTypes(drizzleDb, monitor.id)).toEqual(["monitor_down", "monitor_up"]);
	});

	test("a result older than the last one interpreted does not change the status", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(monitorStatus).values({ monitorId: monitor.id, status: "up" });
		const now = Date.now();

		await insertResult(drizzleDb, monitor.id, { status: "up", responseTimeMs: 1 }, new Date(now));
		await processResults(drizzleDb, monitor.id);
		await insertResult(
			drizzleDb,
			monitor.id,
			{ status: "down", responseTimeMs: 1 },
			new Date(now - 1000),
		);
		expect(await processResults(drizzleDb, monitor.id)).toBe(1);

		expect(await eventTypes(drizzleDb, monitor.id)).toEqual([]);
		const [status] = await drizzleDb
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, monitor.id));
		expect(status.status).toBe("up");
	});

	test("a push heartbeat during maintenance leaves the status frozen", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId, { type: "push", url: null });
		await drizzleDb
			.insert(monitorStatus)
			.values({ monitorId: monitor.id, status: "down", consecutiveFailures: 3 });
		await seedActiveMaintenanceWindow(drizzleDb, orgId, monitor.id);

		await save(drizzleDb, monitor, { status: "up", responseTimeMs: 0 });

		expect(await eventTypes(drizzleDb, monitor.id)).toEqual([]);
		const [status] = await drizzleDb
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, monitor.id));
		expect(status.status).toBe("down");
	});
});

describe("result notifications", () => {
	test("an inserted row notifies with its monitor id, and waits until processed", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrganization(drizzleDb);
		const monitor = await seedMonitor(drizzleDb, orgId);
		const received: string[] = [];
		const unlisten = await db.listen("monitor_check", (payload) => received.push(payload));

		try {
			await insertResult(drizzleDb, monitor.id, { status: "up", responseTimeMs: 1 });
			await waitForNotify(received, monitor.id);
			expect(received).toContain(monitor.id);
			expect(await pendingMonitorIds(drizzleDb)).toContain(monitor.id);

			await processResults(drizzleDb, monitor.id);
			expect(await pendingMonitorIds(drizzleDb)).not.toContain(monitor.id);
		} finally {
			await unlisten();
		}
	});
});
