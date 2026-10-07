import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { organization } from "../db/auth-schema";
import {
	incident,
	incidentMonitor,
	incidentUpdate,
	monitor,
	notificationEvent,
} from "../db/schema";
import { NotFoundError } from "../errors";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { IncidentService } from "./incident.service";

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

async function fetchEvents(drizzleDb: TestDb["db"], incidentId: string) {
	return drizzleDb
		.select()
		.from(notificationEvent)
		.where(eq(notificationEvent.incidentId, incidentId));
}

describe("IncidentService notification enqueue", () => {
	test("create with monitorIds enqueues incident_created with monitorId null and incidentId set", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			title: "API down",
			message: "Investigating elevated 5xx",
			monitorIds: [monitorId],
		});

		const events = await fetchEvents(drizzleDb, created.id);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("incident_created");
		expect(events[0].monitorId).toBeNull();
		expect(events[0].incidentId).toBe(created.id);
		expect(events[0].organizationId).toBe(orgId);
		expect(events[0].status).toBe("pending");
	});

	test("create with empty monitorIds still enqueues (org-wide fallback case)", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const created = await service.create({
			organizationId: orgId,
			title: "Internal-only incident",
			message: "Manual investigation",
		});

		const events = await fetchEvents(drizzleDb, created.id);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("incident_created");
	});

	test("addUpdate with non-resolved status enqueues incident_updated with the message in payload", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const created = await service.create({
			organizationId: orgId,
			title: "X is degraded",
			message: "initial",
		});
		await service.addUpdate({
			incidentId: created.id,
			organizationId: orgId,
			status: "identified",
			message: "Found root cause: bad config",
		});

		const events = await fetchEvents(drizzleDb, created.id);
		const updateEvents = events.filter((e) => e.type === "incident_updated");
		expect(updateEvents).toHaveLength(1);
		expect(updateEvents[0].payload).toMatchObject({
			updateMessage: "Found root cause: bad config",
		});
	});

	test("addUpdate with status='resolved' enqueues incident_resolved", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const created = await service.create({
			organizationId: orgId,
			title: "X is down",
			message: "initial",
		});
		await service.addUpdate({
			incidentId: created.id,
			organizationId: orgId,
			status: "resolved",
			message: "Fixed",
		});

		const events = await fetchEvents(drizzleDb, created.id);
		const resolveEvents = events.filter((e) => e.type === "incident_resolved");
		expect(resolveEvents).toHaveLength(1);
		expect(events.filter((e) => e.type === "incident_updated")).toHaveLength(0);
	});

	test("addUpdate with status='postmortem' enqueues nothing", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const created = await service.create({
			organizationId: orgId,
			title: "X failed",
			message: "initial",
		});
		await service.addUpdate({
			incidentId: created.id,
			organizationId: orgId,
			status: "postmortem",
			message: "What we learned…",
		});

		const events = await fetchEvents(drizzleDb, created.id);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("incident_created");
	});

	test("addUpdate with status='resolved' on an already-resolved incident enqueues nothing", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const created = await service.create({
			organizationId: orgId,
			title: "X is down",
			message: "initial",
		});
		await service.addUpdate({
			incidentId: created.id,
			organizationId: orgId,
			status: "resolved",
			message: "Fixed",
		});
		await service.addUpdate({
			incidentId: created.id,
			organizationId: orgId,
			status: "resolved",
			message: "Re-resolved by accident",
		});

		const events = await fetchEvents(drizzleDb, created.id);
		// One create + exactly one resolve, not two.
		expect(events.filter((e) => e.type === "incident_resolved")).toHaveLength(1);
	});

	test("update flipping status to resolved enqueues incident_resolved", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const created = await service.create({
			organizationId: orgId,
			title: "X down",
			message: "initial",
		});
		await service.update(created.id, orgId, { status: "resolved" });

		const events = await fetchEvents(drizzleDb, created.id);
		const resolveEvents = events.filter((e) => e.type === "incident_resolved");
		expect(resolveEvents).toHaveLength(1);
	});

	test("update with no status (title/impact only) enqueues nothing", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const created = await service.create({
			organizationId: orgId,
			title: "X down",
			message: "initial",
		});
		await service.update(created.id, orgId, { title: "X down — renamed", impact: "major" });

		const events = await fetchEvents(drizzleDb, created.id);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("incident_created");
	});

	test("update setting status=resolved on an already-resolved incident enqueues nothing", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const created = await service.create({
			organizationId: orgId,
			title: "X down",
			message: "initial",
		});
		await service.update(created.id, orgId, { status: "resolved" });
		await service.update(created.id, orgId, { status: "resolved" });

		const events = await fetchEvents(drizzleDb, created.id);
		expect(events.filter((e) => e.type === "incident_resolved")).toHaveLength(1);
	});
});

describe("IncidentService organization scoping", () => {
	test("addUpdate on another organization's incident writes nothing", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const victimOrg = await seedOrg(drizzleDb);
		const attackerOrg = await seedOrg(drizzleDb);
		const victim = await service.create({
			organizationId: victimOrg,
			title: "API down",
			message: "initial",
		});

		const result = await service.addUpdate({
			incidentId: victim.id,
			organizationId: attackerOrg,
			status: "resolved",
			message: "Defaced",
		});

		expect(result).toBeNull();
		const updates = await service.getUpdates(victim.id);
		expect(updates.map((u) => u.message)).toEqual(["initial"]);
		const [row] = await drizzleDb.select().from(incident).where(eq(incident.id, victim.id));
		expect(row.status).toBe("investigating");
		expect(row.resolvedAt).toBeNull();
		const events = await fetchEvents(drizzleDb, victim.id);
		expect(events.map((e) => e.type)).toEqual(["incident_created"]);
	});

	test("updatePostmortem leaves another organization's postmortem untouched", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const victimOrg = await seedOrg(drizzleDb);
		const attackerOrg = await seedOrg(drizzleDb);
		const victim = await service.create({ organizationId: victimOrg, title: "V", message: "v" });
		const postmortem = await service.addUpdate({
			incidentId: victim.id,
			organizationId: victimOrg,
			status: "postmortem",
			message: "What we learned",
		});
		const own = await service.create({ organizationId: attackerOrg, title: "A", message: "a" });

		// The attacker's own incident with the victim's update id, then the victim's incident.
		expect(
			await service.updatePostmortem(own.id, attackerOrg, postmortem!.id, "Defaced"),
		).toBeNull();
		expect(
			await service.updatePostmortem(victim.id, attackerOrg, postmortem!.id, "Defaced"),
		).toBeNull();

		const [row] = await drizzleDb
			.select()
			.from(incidentUpdate)
			.where(eq(incidentUpdate.id, postmortem!.id));
		expect(row.message).toBe("What we learned");
	});

	test("updatePostmortem rewrites only postmortem updates", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const created = await service.create({ organizationId: orgId, title: "X", message: "x" });
		const update = await service.addUpdate({
			incidentId: created.id,
			organizationId: orgId,
			status: "identified",
			message: "Found it",
		});

		expect(await service.updatePostmortem(created.id, orgId, update!.id, "Rewritten")).toBeNull();
	});

	test("create rejects another organization's monitor and writes nothing", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const victimOrg = await seedOrg(drizzleDb);
		const attackerOrg = await seedOrg(drizzleDb);
		const victimMonitor = await seedMonitor(drizzleDb, victimOrg);

		await expect(
			service.create({
				organizationId: attackerOrg,
				title: "Page the victim",
				message: "x",
				monitorIds: [victimMonitor],
			}),
		).rejects.toBeInstanceOf(NotFoundError);

		expect(
			await drizzleDb.select().from(incident).where(eq(incident.organizationId, attackerOrg)),
		).toHaveLength(0);
		expect(
			await drizzleDb
				.select()
				.from(incidentMonitor)
				.where(eq(incidentMonitor.monitorId, victimMonitor)),
		).toHaveLength(0);
	});

	test("create links a monitor listed twice once", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			title: "Outage",
			message: "x",
			monitorIds: [monitorId, monitorId],
		});

		expect(
			await drizzleDb
				.select()
				.from(incidentMonitor)
				.where(eq(incidentMonitor.incidentId, created.id)),
		).toHaveLength(1);
	});

	test("findWithDetails hides an existing link to another organization's monitor", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new IncidentService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const otherOrg = await seedOrg(drizzleDb);
		const ownMonitor = await seedMonitor(drizzleDb, orgId);
		const foreignMonitor = await seedMonitor(drizzleDb, otherOrg);
		const created = await service.create({
			organizationId: orgId,
			title: "X",
			message: "x",
			monitorIds: [ownMonitor],
		});
		await drizzleDb
			.insert(incidentMonitor)
			.values({ incidentId: created.id, monitorId: foreignMonitor });

		const details = await service.findWithDetails(created.id, orgId);

		expect(details!.affectedMonitors.map((m) => m.id)).toEqual([ownMonitor]);
	});
});
