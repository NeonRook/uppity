import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { organization, user } from "../db/auth-schema";
import { monitor, maintenanceWindow, maintenanceWindowMonitor } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { MaintenanceWindowService } from "./maintenance-window.service";

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

async function seedUser(drizzleDb: TestDb["db"]): Promise<string> {
	const suffix = nanoid();
	const userId = `test-user-${suffix}`;
	await drizzleDb.insert(user).values({
		id: userId,
		name: "Test User",
		email: `${userId}@example.com`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	return userId;
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

describe("MaintenanceWindowService.create", () => {
	test("creates a window with associated monitors", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const startsAt = new Date(Date.now() + 60_000);
		const endsAt = new Date(Date.now() + 3_600_000);

		const window = await service.create({
			organizationId: orgId,
			name: "Patch deploy",
			description: "Rolling out v2",
			startsAt,
			endsAt,
			monitorIds: [monitorId],
		});

		expect(window.id).toBeTruthy();
		expect(window.name).toBe("Patch deploy");
		expect(window.status).toBe("scheduled");
		expect(window.startsAt).toEqual(startsAt);
		expect(window.endsAt).toEqual(endsAt);

		const links = await drizzleDb
			.select()
			.from(maintenanceWindowMonitor)
			.where(eq(maintenanceWindowMonitor.windowId, window.id));
		expect(links).toHaveLength(1);
		expect(links[0].monitorId).toBe(monitorId);
	});

	test("rejects when end time is before start time", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		await expect(
			service.create({
				organizationId: orgId,
				name: "Bad window",
				startsAt: new Date(Date.now() + 3_600_000),
				endsAt: new Date(Date.now() + 60_000),
				monitorIds: [monitorId],
			}),
		).rejects.toThrow("End time must be after start time");
	});

	test("rejects when end time is in the past", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		await expect(
			service.create({
				organizationId: orgId,
				name: "Past window",
				startsAt: new Date(Date.now() - 7_200_000),
				endsAt: new Date(Date.now() - 3_600_000),
				monitorIds: [monitorId],
			}),
		).rejects.toThrow("End time must be in the future");
	});

	test("rejects when name is blank", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		await expect(
			service.create({
				organizationId: orgId,
				name: "   ",
				startsAt: new Date(Date.now() + 60_000),
				endsAt: new Date(Date.now() + 3_600_000),
				monitorIds: [monitorId],
			}),
		).rejects.toThrow("Name is required");
	});

	test("rejects when monitorIds belong to a different organization", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgA = await seedOrg(drizzleDb);
		const orgB = await seedOrg(drizzleDb);
		const monitorB = await seedMonitor(drizzleDb, orgB);

		await expect(
			service.create({
				organizationId: orgA,
				name: "Cross-org",
				startsAt: new Date(Date.now() + 60_000),
				endsAt: new Date(Date.now() + 3_600_000),
				monitorIds: [monitorB],
			}),
		).rejects.toThrow("Monitor not found");
	});

	test("rejects when monitorIds is empty", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		await expect(
			service.create({
				organizationId: orgId,
				name: "Empty monitors",
				startsAt: new Date(Date.now() + 60_000),
				endsAt: new Date(Date.now() + 3_600_000),
				monitorIds: [],
			}),
		).rejects.toThrow("Select at least one monitor");
	});

	test("stores createdBy when provided", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const userId = await seedUser(drizzleDb);

		const window = await service.create({
			organizationId: orgId,
			name: "With creator",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorId],
			createdBy: userId,
		});

		expect(window.createdBy).toBe(userId);
	});
});

describe("MaintenanceWindowService.findById", () => {
	test("returns null when window does not exist", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const result = await service.findById("nonexistent", orgId);
		expect(result).toBeNull();
	});

	test("returns window with monitor ids", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		const m2 = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Window",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [m1, m2],
		});

		const result = await service.findById(created.id, orgId);
		expect(result).not.toBeNull();
		expect(result!.id).toBe(created.id);
		expect(result!.monitorIds).toHaveLength(2);
		expect(new Set(result!.monitorIds)).toEqual(new Set([m1, m2]));
	});

	test("is scoped to organization", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgA = await seedOrg(drizzleDb);
		const orgB = await seedOrg(drizzleDb);
		const monitorA = await seedMonitor(drizzleDb, orgA);

		const created = await service.create({
			organizationId: orgA,
			name: "OrgA window",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorA],
		});

		const result = await service.findById(created.id, orgB);
		expect(result).toBeNull();
	});
});

describe("MaintenanceWindowService.listByOrg", () => {
	test("returns summaries with monitor counts", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		const m2 = await seedMonitor(drizzleDb, orgId);
		const m3 = await seedMonitor(drizzleDb, orgId);

		await service.create({
			organizationId: orgId,
			name: "Window A",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [m1, m2, m3],
		});
		await service.create({
			organizationId: orgId,
			name: "Window B",
			startsAt: new Date(Date.now() + 120_000),
			endsAt: new Date(Date.now() + 7_200_000),
			monitorIds: [m1],
		});

		const results = await service.listByOrg(orgId);
		expect(results).toHaveLength(2);
		const byName = new Map(results.map((r) => [r.name, r]));
		expect(byName.get("Window A")!.monitorCount).toBe(3);
		expect(byName.get("Window B")!.monitorCount).toBe(1);
	});

	test("filters by status", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Scheduled then cancelled",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorId],
		});
		await service.cancel(created.id, orgId);

		const scheduled = await service.listByOrg(orgId, { status: ["scheduled"] });
		expect(scheduled).toHaveLength(0);

		const cancelled = await service.listByOrg(orgId, { status: ["cancelled"] });
		expect(cancelled).toHaveLength(1);
	});

	test("is scoped to organization", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgA = await seedOrg(drizzleDb);
		const orgB = await seedOrg(drizzleDb);
		const monitorA = await seedMonitor(drizzleDb, orgA);

		await service.create({
			organizationId: orgA,
			name: "OrgA window",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorA],
		});

		const fromOrgB = await service.listByOrg(orgB);
		expect(fromOrgB).toHaveLength(0);
	});
});

describe("MaintenanceWindowService.update", () => {
	test("updates name and description", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Old",
			description: "Old desc",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorId],
		});

		const updated = await service.update(created.id, orgId, {
			name: "New",
			description: "New desc",
		});
		expect(updated.name).toBe("New");
		expect(updated.description).toBe("New desc");
	});

	test("replaces monitor set when monitorIds present", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		const m2 = await seedMonitor(drizzleDb, orgId);
		const m3 = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Window",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [m1, m2],
		});

		await service.update(created.id, orgId, { monitorIds: [m3] });

		const links = await drizzleDb
			.select()
			.from(maintenanceWindowMonitor)
			.where(eq(maintenanceWindowMonitor.windowId, created.id));
		expect(links).toHaveLength(1);
		expect(links[0].monitorId).toBe(m3);
	});

	test("update with partial overlap of monitorIds preserves the intersection", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		const m2 = await seedMonitor(drizzleDb, orgId);
		const m3 = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Partial",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 120_000),
			monitorIds: [m1, m2],
		});

		await service.update(created.id, orgId, { monitorIds: [m2, m3] });

		const fetched = await service.findById(created.id, orgId);
		expect(fetched!.monitorIds.toSorted()).toEqual([m2, m3].toSorted());
	});

	test("rejects when end before start", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Window",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorId],
		});

		await expect(
			service.update(created.id, orgId, {
				startsAt: new Date(Date.now() + 7_200_000),
				endsAt: new Date(Date.now() + 60_000),
			}),
		).rejects.toThrow("End time must be after start time");
	});
});

describe("MaintenanceWindowService.cancel", () => {
	test("cancels a scheduled window", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Window",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorId],
		});

		const result = await service.cancel(created.id, orgId);
		expect(result.status).toBe("cancelled");
	});

	test("rejects when status='completed'", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Window",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorId],
		});

		// Force into 'completed' via direct update bypassing service.
		await drizzleDb
			.update(maintenanceWindow)
			.set({ status: "completed" })
			.where(eq(maintenanceWindow.id, created.id));

		await expect(service.cancel(created.id, orgId)).rejects.toThrow(
			"Cannot cancel a completed window",
		);
	});
});

describe("MaintenanceWindowService.delete", () => {
	test("deletes a window and cascades the join rows", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const created = await service.create({
			organizationId: orgId,
			name: "Window",
			startsAt: new Date(Date.now() + 60_000),
			endsAt: new Date(Date.now() + 3_600_000),
			monitorIds: [monitorId],
		});

		await service.delete(created.id, orgId);

		const windowsAfter = await drizzleDb
			.select()
			.from(maintenanceWindow)
			.where(eq(maintenanceWindow.id, created.id));
		expect(windowsAfter).toHaveLength(0);

		const linksAfter = await drizzleDb
			.select()
			.from(maintenanceWindowMonitor)
			.where(eq(maintenanceWindowMonitor.windowId, created.id));
		expect(linksAfter).toHaveLength(0);
	});
});

describe("MaintenanceWindowService.findActiveForMonitor", () => {
	test("returns null when no active window covers monitor", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const result = await service.findActiveForMonitor(monitorId);
		expect(result).toBeNull();
	});

	test("returns active in_progress window covering monitor at `at`", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		// Insert directly with status='in_progress' and times spanning `now`.
		const now = new Date();
		const id = nanoid();
		await drizzleDb.insert(maintenanceWindow).values({
			id,
			organizationId: orgId,
			name: "Active",
			status: "in_progress",
			startsAt: new Date(now.getTime() - 60_000),
			endsAt: new Date(now.getTime() + 60_000),
		});
		await drizzleDb.insert(maintenanceWindowMonitor).values({ windowId: id, monitorId });

		const result = await service.findActiveForMonitor(monitorId, now);
		expect(result).not.toBeNull();
		expect(result!.id).toBe(id);
	});

	test("ignores scheduled windows even when time covers now", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const now = new Date();
		const id = nanoid();
		await drizzleDb.insert(maintenanceWindow).values({
			id,
			organizationId: orgId,
			name: "Still scheduled",
			status: "scheduled",
			startsAt: new Date(now.getTime() - 60_000),
			endsAt: new Date(now.getTime() + 60_000),
		});
		await drizzleDb.insert(maintenanceWindowMonitor).values({ windowId: id, monitorId });

		const result = await service.findActiveForMonitor(monitorId, now);
		expect(result).toBeNull();
	});
});

describe("MaintenanceWindowService.findActiveMonitorIds", () => {
	test("returns set of monitor ids under active in_progress windows", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const m1 = await seedMonitor(drizzleDb, orgId);
		const m2 = await seedMonitor(drizzleDb, orgId);
		const m3 = await seedMonitor(drizzleDb, orgId);

		const now = new Date();
		const id = nanoid();
		await drizzleDb.insert(maintenanceWindow).values({
			id,
			organizationId: orgId,
			name: "Active",
			status: "in_progress",
			startsAt: new Date(now.getTime() - 60_000),
			endsAt: new Date(now.getTime() + 60_000),
		});
		await drizzleDb.insert(maintenanceWindowMonitor).values([
			{ windowId: id, monitorId: m1 },
			{ windowId: id, monitorId: m2 },
		]);

		const result = await service.findActiveMonitorIds(now);
		expect(result.has(m1)).toBe(true);
		expect(result.has(m2)).toBe(true);
		expect(result.has(m3)).toBe(false);
	});

	test("returns empty set for monitors with no active windows", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);

		const result = await service.findActiveMonitorIds();
		// Other tests in this file seed unrelated active windows; assert
		// only that our freshly-seeded monitor isn't in the result set.
		expect(result.has(monitorId)).toBe(false);
	});
});

describe("MaintenanceWindowService.runStatusTransitions", () => {
	test("transitions scheduled -> in_progress when startsAt is past and endsAt is future", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const now = new Date();
		const id = nanoid();
		await drizzleDb.insert(maintenanceWindow).values({
			id,
			organizationId: orgId,
			name: "Should start",
			status: "scheduled",
			startsAt: new Date(now.getTime() - 60_000),
			endsAt: new Date(now.getTime() + 3_600_000),
		});

		// Counts are global; other tests in this file may also have transitionable
		// state. Assert only that this specific window started.
		const result = await service.runStatusTransitions(now);
		expect(result.started).toBeGreaterThanOrEqual(1);

		const [row] = await drizzleDb
			.select()
			.from(maintenanceWindow)
			.where(eq(maintenanceWindow.id, id));
		expect(row.status).toBe("in_progress");
	});

	test("transitions in_progress -> completed when endsAt is past", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const now = new Date();
		const id = nanoid();
		await drizzleDb.insert(maintenanceWindow).values({
			id,
			organizationId: orgId,
			name: "Should complete",
			status: "in_progress",
			startsAt: new Date(now.getTime() - 7_200_000),
			endsAt: new Date(now.getTime() - 60_000),
		});

		const result = await service.runStatusTransitions(now);
		expect(result.completed).toBeGreaterThanOrEqual(1);

		const [row] = await drizzleDb
			.select()
			.from(maintenanceWindow)
			.where(eq(maintenanceWindow.id, id));
		expect(row.status).toBe("completed");
	});

	test("handles entirely-past scheduled window in one pass: start then complete", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new MaintenanceWindowService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);

		const now = new Date();
		const id = nanoid();
		await drizzleDb.insert(maintenanceWindow).values({
			id,
			organizationId: orgId,
			name: "Missed entirely",
			status: "scheduled",
			startsAt: new Date(now.getTime() - 7_200_000),
			endsAt: new Date(now.getTime() - 60_000),
		});

		const result = await service.runStatusTransitions(now);
		// Window enters in_progress in pass 1, then completed in pass 2 — both
		// counters bumped by this single row (other tests may also transition).
		expect(result.started).toBeGreaterThanOrEqual(1);
		expect(result.completed).toBeGreaterThanOrEqual(1);

		const [row] = await drizzleDb
			.select()
			.from(maintenanceWindow)
			.where(eq(maintenanceWindow.id, id));
		expect(row.status).toBe("completed");
	});
});
