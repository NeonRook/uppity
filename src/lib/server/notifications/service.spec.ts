import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { organization } from "../db/auth-schema";
import {
	incident,
	incidentMonitor,
	monitor,
	monitorNotificationChannel,
	notificationChannel,
	notificationEvent,
	notificationLog,
} from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { NotificationService } from "./service";

async function seedOrg(drizzleDb: TestDb["db"]): Promise<string> {
	const suffix = nanoid();
	const orgId = `test-org-${suffix}`;
	await drizzleDb.insert(organization).values({
		id: orgId,
		name: `Test Org ${suffix}`,
		slug: orgId,
		createdAt: new Date(),
	});
	return orgId;
}

async function seedMonitor(drizzleDb: TestDb["db"], orgId: string): Promise<string> {
	const id = `mon-${nanoid()}`;
	await drizzleDb.insert(monitor).values({
		id,
		organizationId: orgId,
		name: "Probe",
		type: "http",
		url: "https://example.com",
		intervalSeconds: 300,
		timeoutSeconds: 30,
	});
	return id;
}

async function seedWebhookChannel(
	drizzleDb: TestDb["db"],
	orgId: string,
	url = "https://example.test/hook",
): Promise<string> {
	const id = `chan-${nanoid()}`;
	await drizzleDb.insert(notificationChannel).values({
		id,
		organizationId: orgId,
		name: "Webhook",
		type: "webhook",
		config: { url },
		enabled: true,
	});
	return id;
}

async function linkMonitorToChannel(
	drizzleDb: TestDb["db"],
	monitorId: string,
	channelId: string,
): Promise<void> {
	await drizzleDb.insert(monitorNotificationChannel).values({
		monitorId,
		channelId,
	});
}

async function seedIncident(
	drizzleDb: TestDb["db"],
	orgId: string,
	monitorIds: string[] = [],
): Promise<string> {
	const id = `inc-${nanoid()}`;
	await drizzleDb.insert(incident).values({
		id,
		organizationId: orgId,
		title: "Test incident",
		status: "investigating",
		impact: "minor",
		startedAt: new Date(),
	});
	for (const monitorId of monitorIds) {
		await drizzleDb.insert(incidentMonitor).values({ incidentId: id, monitorId });
	}
	return id;
}

async function enqueueIncidentEvent(
	drizzleDb: TestDb["db"],
	orgId: string,
	incidentId: string,
	type: "incident_created" | "incident_updated" | "incident_resolved",
): Promise<string> {
	const id = `evt-${nanoid()}`;
	await drizzleDb.insert(notificationEvent).values({
		id,
		organizationId: orgId,
		monitorId: null,
		incidentId,
		type,
		payload: {},
		status: "pending",
	});
	return id;
}

async function fetchEvent(drizzleDb: TestDb["db"], id: string) {
	const [row] = await drizzleDb
		.select()
		.from(notificationEvent)
		.where(eq(notificationEvent.id, id))
		.limit(1);
	return row;
}

describe("NotificationService.dispatchEvent (incident)", () => {
	test("fans out to channels linked to affected monitors, dedup by channel id", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		const m2 = await seedMonitor(drizzleDb, orgId);
		// One channel linked to both monitors — must dispatch once, not twice.
		const channelId = await seedWebhookChannel(drizzleDb, orgId);
		await linkMonitorToChannel(drizzleDb, m1, channelId);
		await linkMonitorToChannel(drizzleDb, m2, channelId);

		const incidentId = await seedIncident(drizzleDb, orgId, [m1, m2]);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");

		const row = await fetchEvent(drizzleDb, eventId);
		const result = await service.dispatchEvent(row);

		// Webhook will fail (no real server) but we only care about routing here.
		// The proof of dedup: notificationLog has exactly one row, not two.
		const logs = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.incidentId, incidentId));
		expect(logs).toHaveLength(1);
		expect(logs[0].channelId).toBe(channelId);
		// Either sent or failed depending on network; not suppressed.
		expect(["sent", "failed", "partial"]).toContain(result.status);
	});

	test("incident with zero linked monitors falls back to all enabled org channels", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const channelA = await seedWebhookChannel(drizzleDb, orgId);
		const channelB = await seedWebhookChannel(drizzleDb, orgId, "https://example.test/b");

		const incidentId = await seedIncident(drizzleDb, orgId, []);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");
		const row = await fetchEvent(drizzleDb, eventId);

		await service.dispatchEvent(row);

		const logs = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.incidentId, incidentId));
		const channelIds = logs.map((l) => l.channelId).toSorted();
		expect(channelIds).toEqual([channelA, channelB].toSorted());
	});

	test("incident with zero linked monitors AND zero org channels returns suppressed", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const incidentId = await seedIncident(drizzleDb, orgId, []);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");
		const row = await fetchEvent(drizzleDb, eventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("suppressed");
		expect((result as { status: "suppressed"; errorMessage: string }).errorMessage).toMatch(
			/no channels configured/,
		);
	});

	test("event with null incident_id returns suppressed (defensive branch)", async ({ db }) => {
		// The deleted-incident race is hard to exercise directly because the FK has
		// ON DELETE CASCADE — deleting the incident removes the event row before
		// dispatch could ever run. This test covers the closest reachable branch:
		// a row with incident_id null, which the suppress-on-missing-id check
		// guards against the same way.
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const orphanEventId = `evt-orphan-${nanoid()}`;
		await drizzleDb.insert(notificationEvent).values({
			id: orphanEventId,
			organizationId: orgId,
			monitorId: null,
			incidentId: null,
			type: "incident_created",
			payload: {},
			status: "pending",
		});
		const row = await fetchEvent(drizzleDb, orphanEventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("suppressed");
		expect((result as { status: "suppressed"; errorMessage: string }).errorMessage).toMatch(
			/no incident_id/,
		);
	});

	test("malformed payload (wrong shape for incident type) returns failed", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const incidentId = await seedIncident(drizzleDb, orgId, []);
		const eventId = `evt-${nanoid()}`;
		await drizzleDb.insert(notificationEvent).values({
			id: eventId,
			organizationId: orgId,
			monitorId: null,
			incidentId,
			type: "incident_created",
			// updateId expected to be string if present; numeric breaks valibot.
			payload: { updateId: 42 },
			status: "pending",
		});
		const row = await fetchEvent(drizzleDb, eventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("failed");
		expect((result as { status: "failed"; errorMessage: string }).errorMessage).toMatch(
			/invalid payload/,
		);
	});

	test("incident with linked monitors but no channels suppresses with explicit reason", async ({
		db,
	}) => {
		// Distinct from the org-wide fallback: the user explicitly scoped the incident
		// to a monitor that happens to have zero channels wired up. Falling back to
		// every org channel here would silently widen blast radius for a misconfigured
		// monitor, so we suppress with a message that points at the actual problem.
		const { db: drizzleDb } = db;
		const service = new NotificationService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		// Seed an enabled org channel that is NOT linked to m1 — the test proves it
		// doesn't get used.
		await seedWebhookChannel(drizzleDb, orgId, "https://example.test/unrelated");

		const incidentId = await seedIncident(drizzleDb, orgId, [m1]);
		const eventId = await enqueueIncidentEvent(drizzleDb, orgId, incidentId, "incident_created");
		const row = await fetchEvent(drizzleDb, eventId);

		const result = await service.dispatchEvent(row);

		expect(result.status).toBe("suppressed");
		expect((result as { status: "suppressed"; errorMessage: string }).errorMessage).toMatch(
			/linked monitors have no channels configured/,
		);

		// Belt-and-suspenders: no notificationLog row was written.
		const logs = await drizzleDb
			.select()
			.from(notificationLog)
			.where(eq(notificationLog.incidentId, incidentId));
		expect(logs).toHaveLength(0);
	});
});
