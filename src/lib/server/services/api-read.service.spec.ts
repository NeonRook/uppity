import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";

import {
	incident,
	incidentMonitor,
	incidentUpdate,
	monitor,
	monitorCheck,
	monitorStatus,
	statusPage,
	statusPageMonitor,
} from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedMonitor, seedOrg } from "../test/seed";
import { ApiReadService } from "./api-read.service";

const page = (limit: number, after: string | null = null) => ({ limit, after });

/** Monitors created one second apart, oldest first. */
async function seedMonitorsAt(db: TestDb["db"], orgId: string, count: number) {
	const ids: string[] = [];
	for (let i = 0; i < count; i++) {
		const id = await seedMonitor(db, orgId);
		await db
			.update(monitor)
			.set({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) })
			.where(eq(monitor.id, id));
		ids.push(id);
	}
	return ids;
}

describe("ApiReadService monitors", () => {
	test("lists only the organization's monitors, without request secrets", async ({ db }) => {
		const service = new ApiReadService(db.db);
		const orgId = await seedOrg(db.db);
		const otherOrg = await seedOrg(db.db);
		const mine = await seedMonitor(db.db, orgId);
		await seedMonitor(db.db, otherOrg);
		await db.db
			.update(monitor)
			.set({
				url: "https://user:secret@example.com/health?token=secret",
				headers: { authorization: "Bearer secret" },
				body: "secret",
				pushToken: "secret",
			})
			.where(eq(monitor.id, mine));

		const result = await service.listMonitors(orgId, page(50));

		expect(result?.data.map((m) => m.id)).toEqual([mine]);
		expect(JSON.stringify(result)).not.toContain("secret");
		expect(result?.data[0]).toMatchObject({
			url: "https://example.com/health?token=***",
			status: "unknown",
			method: "GET",
			active: true,
		});
	});

	test("pages newest first and refuses a cursor from another organization", async ({ db }) => {
		const service = new ApiReadService(db.db);
		const orgId = await seedOrg(db.db);
		const [oldest, middle, newest] = await seedMonitorsAt(db.db, orgId, 3);

		const first = await service.listMonitors(orgId, page(2));
		expect(first?.data.map((m) => m.id)).toEqual([newest, middle]);
		expect(first?.nextCursor).toBe(middle);

		const second = await service.listMonitors(orgId, page(2, middle));
		expect(second).toEqual({ data: [expect.objectContaining({ id: oldest })], nextCursor: null });

		const otherOrg = await seedOrg(db.db);
		expect(await service.listMonitors(otherOrg, page(2, middle))).toBeNull();
	});

	test("reports a dead-lettered monitor as not checked", async ({ db }) => {
		const service = new ApiReadService(db.db);
		const orgId = await seedOrg(db.db);
		const id = await seedMonitor(db.db, orgId);
		await db.db.update(monitor).set({ deadLetteredAt: new Date() }).where(eq(monitor.id, id));

		expect(await service.getMonitor(orgId, id)).toMatchObject({ status: "not_checked" });
		expect(await service.getMonitor(await seedOrg(db.db), id)).toBeNull();
	});
});

describe("ApiReadService checks", () => {
	test("pages through checks that share a timestamp without skipping any", async ({ db }) => {
		const service = new ApiReadService(db.db);
		const orgId = await seedOrg(db.db);
		const monitorId = await seedMonitor(db.db, orgId);
		const checkedAt = new Date("2026-01-01T00:00:00Z");
		const ids = ["chk-a", "chk-b", "chk-c", "chk-d", "chk-e"];
		await db.db
			.insert(monitorCheck)
			.values(ids.map((id) => ({ id, monitorId, status: "up", checkedAt })));

		const seen: string[] = [];
		let after: string | null = null;
		do {
			const result = await service.listChecks(monitorId, page(2, after));
			seen.push(...(result?.data.map((c) => c.id) ?? []));
			after = result?.nextCursor ?? null;
		} while (after);

		expect(seen.toSorted()).toEqual(ids);
		expect(new Set(seen).size).toBe(ids.length);
	});
});

describe("ApiReadService incidents", () => {
	test("returns an incident with its updates and only the organization's monitors", async ({
		db,
	}) => {
		const service = new ApiReadService(db.db);
		const orgId = await seedOrg(db.db);
		const monitorId = await seedMonitor(db.db, orgId);
		const foreignMonitor = await seedMonitor(db.db, await seedOrg(db.db));
		await db.db.insert(incident).values({ id: "inc-1", organizationId: orgId, title: "API down" });
		await db.db.insert(incidentMonitor).values([
			{ incidentId: "inc-1", monitorId },
			{ incidentId: "inc-1", monitorId: foreignMonitor },
		]);
		await db.db
			.insert(incidentUpdate)
			.values({ id: "upd-1", incidentId: "inc-1", status: "investigating", message: "Looking" });

		const found = await service.getIncident(orgId, "inc-1");

		expect(found).toMatchObject({
			title: "API down",
			autoCreated: false,
			updates: [{ id: "upd-1", message: "Looking" }],
			affectedMonitors: [{ id: monitorId, name: "Probe" }],
		});
		expect(await service.getIncident(await seedOrg(db.db), "inc-1")).toBeNull();
	});

	test("lists resolved incidents too", async ({ db }) => {
		const service = new ApiReadService(db.db);
		const orgId = await seedOrg(db.db);
		await db.db.insert(incident).values([
			{ id: "inc-open", organizationId: orgId, title: "Open" },
			{ id: "inc-done", organizationId: orgId, title: "Done", status: "resolved" },
		]);

		const result = await service.listIncidents(orgId, page(50));
		expect(result?.data.map((i) => i.id).toSorted()).toEqual(["inc-done", "inc-open"]);
	});
});

async function seedPage(db: TestDb["db"], orgId: string, second: number, isPublic = true) {
	const id = `sp-${orgId}-${second}`;
	await db.insert(statusPage).values({
		id,
		organizationId: orgId,
		name: "Status",
		slug: id.toLowerCase(),
		isPublic,
		customCss: "secret",
		createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, second)),
	});
	return id;
}

describe("ApiReadService status pages", () => {
	test("lists private pages too, scoped and paged newest first", async ({ db }) => {
		const service = new ApiReadService(db.db);
		const orgId = await seedOrg(db.db);
		const otherOrg = await seedOrg(db.db);
		const older = await seedPage(db.db, orgId, 0, false);
		const newer = await seedPage(db.db, orgId, 1);
		await seedPage(db.db, otherOrg, 2);

		const first = await service.listStatusPages(orgId, page(1));
		expect(first).toEqual({ data: [expect.objectContaining({ id: newer })], nextCursor: newer });
		expect(JSON.stringify(first)).not.toContain("secret");

		const second = await service.listStatusPages(orgId, page(1, newer));
		expect(second).toEqual({
			data: [expect.objectContaining({ id: older, isPublic: false })],
			nextCursor: null,
		});
		expect(await service.listStatusPages(otherOrg, page(1, newer))).toBeNull();
	});

	test("returns components with the status the page shows", async ({ db }) => {
		const service = new ApiReadService(db.db);
		const orgId = await seedOrg(db.db);
		const pageId = await seedPage(db.db, orgId, 0, false);
		const monitorId = await seedMonitor(db.db, orgId);
		await db.db.insert(statusPageMonitor).values({
			id: "spm-1",
			statusPageId: pageId,
			monitorId,
			displayName: "API",
		});
		await db.db.insert(monitorStatus).values({ monitorId, status: "down" });

		const detail = await service.getStatusPage(orgId, pageId);

		expect(JSON.stringify(detail)).not.toContain("secret");
		expect(detail).toMatchObject({
			id: pageId,
			isPublic: false,
			overallStatus: "major_outage",
			groups: [],
			components: [{ id: "spm-1", monitorId, name: "API", groupId: null, status: "down" }],
		});
		expect(await service.getStatusPage(await seedOrg(db.db), pageId)).toBeNull();
	});
});
