import { STATUS_PAGE_HISTORY_DAYS } from "$lib/constants/defaults";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { organization } from "../db/auth-schema";
import {
	maintenanceWindow,
	maintenanceWindowMonitor,
	monitor,
	monitorCheck,
	statusPage,
	statusPageMonitor,
} from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { StatusPageService } from "./status-page.service";

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

async function seedStatusPageWithMonitor(
	drizzleDb: TestDb["db"],
	orgId: string,
	monitorId: string,
): Promise<{ pageId: string; slug: string }> {
	const suffix = nanoid();
	const pageId = `sp-${suffix}`;
	const slug = `slug-${suffix}`.toLowerCase();
	await drizzleDb.insert(statusPage).values({
		id: pageId,
		organizationId: orgId,
		name: "Public",
		slug,
		isPublic: true,
	});
	await drizzleDb.insert(statusPageMonitor).values({
		id: `spm-${suffix}`,
		statusPageId: pageId,
		monitorId,
		order: 0,
	});
	return { pageId, slug };
}

async function seedMaintenanceWindow(
	drizzleDb: TestDb["db"],
	orgId: string,
	monitorId: string,
	args: {
		status: "scheduled" | "in_progress" | "completed" | "cancelled";
		startsAt: Date;
		endsAt: Date;
		name?: string;
	},
): Promise<string> {
	const id = `mw-${nanoid()}`;
	await drizzleDb.insert(maintenanceWindow).values({
		id,
		organizationId: orgId,
		name: args.name ?? "Window",
		status: args.status,
		startsAt: args.startsAt,
		endsAt: args.endsAt,
	});
	await drizzleDb.insert(maintenanceWindowMonitor).values({ windowId: id, monitorId });
	return id;
}

async function seedCheck(
	drizzleDb: TestDb["db"],
	monitorId: string,
	status: "up" | "down" | "degraded",
	checkedAt: Date,
): Promise<void> {
	await drizzleDb.insert(monitorCheck).values({
		id: `mc-${nanoid()}`,
		monitorId,
		status,
		checkedAt,
	});
}

function daysAgo(n: number, hour = 12): Date {
	const d = new Date();
	d.setDate(d.getDate() - n);
	d.setHours(hour, 0, 0, 0);
	return d;
}

describe("StatusPageService.getPublicStatusPage — maintenance", () => {
	test("monitor under active window has status 'maintenance' on the public page", async ({
		db,
	}) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const now = new Date();
		const windowId = await seedMaintenanceWindow(drizzleDb, orgId, monitorId, {
			status: "in_progress",
			startsAt: new Date(now.getTime() - 60_000),
			endsAt: new Date(now.getTime() + 60 * 60_000),
			name: "Active patching",
		});

		const result = await service.getPublicStatusPage(slug);
		expect(result).not.toBeNull();
		expect(result!.ungroupedMonitors).toHaveLength(1);
		expect(result!.ungroupedMonitors[0].status).toBe("maintenance");
		expect(result!.activeMaintenance).toHaveLength(1);
		expect(result!.activeMaintenance[0].id).toBe(windowId);
		expect(result!.activeMaintenance[0].affectedMonitorIds).toContain(monitorId);
	});

	test("scheduled window within 7 days appears in upcomingMaintenance", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60_000);
		const windowId = await seedMaintenanceWindow(drizzleDb, orgId, monitorId, {
			status: "scheduled",
			startsAt: threeDaysFromNow,
			endsAt: new Date(threeDaysFromNow.getTime() + 60 * 60_000),
			name: "Patch next week",
		});

		const result = await service.getPublicStatusPage(slug);
		expect(result).not.toBeNull();
		expect(result!.upcomingMaintenance).toHaveLength(1);
		expect(result!.upcomingMaintenance[0].id).toBe(windowId);
	});

	test("scheduled window outside 7-day horizon is NOT in upcomingMaintenance", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60_000);
		await seedMaintenanceWindow(drizzleDb, orgId, monitorId, {
			status: "scheduled",
			startsAt: thirtyDaysFromNow,
			endsAt: new Date(thirtyDaysFromNow.getTime() + 60 * 60_000),
			name: "Far future",
		});

		const result = await service.getPublicStatusPage(slug);
		expect(result).not.toBeNull();
		expect(result!.upcomingMaintenance).toHaveLength(0);
	});

	test("cancelled windows are not surfaced anywhere", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const now = new Date();
		// Cancelled window that would have been active right now.
		await seedMaintenanceWindow(drizzleDb, orgId, monitorId, {
			status: "cancelled",
			startsAt: new Date(now.getTime() - 60_000),
			endsAt: new Date(now.getTime() + 60 * 60_000),
			name: "Cancelled active",
		});
		// Cancelled window that would have been upcoming within 7 days.
		const twoDays = new Date(now.getTime() + 2 * 24 * 60 * 60_000);
		await seedMaintenanceWindow(drizzleDb, orgId, monitorId, {
			status: "cancelled",
			startsAt: twoDays,
			endsAt: new Date(twoDays.getTime() + 60 * 60_000),
			name: "Cancelled upcoming",
		});

		const result = await service.getPublicStatusPage(slug);
		expect(result).not.toBeNull();
		expect(result!.activeMaintenance).toHaveLength(0);
		expect(result!.upcomingMaintenance).toHaveLength(0);
		// And the monitor is NOT under maintenance.
		expect(result!.ungroupedMonitors[0].status).not.toBe("maintenance");
	});

	test("checks during completed window are excluded from uptime aggregation", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const now = new Date();
		// Completed window from 5 days ago to 4 days ago.
		const windowStart = new Date(now.getTime() - 5 * 24 * 60 * 60_000);
		const windowEnd = new Date(now.getTime() - 4 * 24 * 60 * 60_000);
		await seedMaintenanceWindow(drizzleDb, orgId, monitorId, {
			status: "completed",
			startsAt: windowStart,
			endsAt: windowEnd,
			name: "Last week's patch",
		});

		// Down checks INSIDE the window — should be excluded.
		await seedCheck(drizzleDb, monitorId, "down", new Date(windowStart.getTime() + 5 * 60_000));
		await seedCheck(drizzleDb, monitorId, "down", new Date(windowStart.getTime() + 30 * 60_000));
		// Up checks AFTER the window — should count.
		await seedCheck(drizzleDb, monitorId, "up", new Date(windowEnd.getTime() + 60 * 60_000));
		await seedCheck(drizzleDb, monitorId, "up", new Date(windowEnd.getTime() + 2 * 60 * 60_000));

		const result = await service.getPublicStatusPage(slug);
		expect(result).not.toBeNull();
		expect(result!.ungroupedMonitors).toHaveLength(1);
		expect(result!.ungroupedMonitors[0].uptimePercent90d).toBe(100);
	});

	test("checks during cancelled window DO count toward uptime", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const now = new Date();
		const windowStart = new Date(now.getTime() - 5 * 24 * 60 * 60_000);
		const windowEnd = new Date(now.getTime() - 4 * 24 * 60 * 60_000);
		await seedMaintenanceWindow(drizzleDb, orgId, monitorId, {
			status: "cancelled",
			startsAt: windowStart,
			endsAt: windowEnd,
			name: "Cancelled patch",
		});

		// Down checks INSIDE the (cancelled) window — should still count.
		await seedCheck(drizzleDb, monitorId, "down", new Date(windowStart.getTime() + 5 * 60_000));
		await seedCheck(drizzleDb, monitorId, "down", new Date(windowStart.getTime() + 30 * 60_000));

		const result = await service.getPublicStatusPage(slug);
		expect(result).not.toBeNull();
		expect(result!.ungroupedMonitors).toHaveLength(1);
		expect(result!.ungroupedMonitors[0].uptimePercent90d).toBe(0);
	});
});

describe("StatusPageService.getFeaturedUptime", () => {
	test("returns null for a slug that does not exist", async ({ db }) => {
		const service = new StatusPageService(db.db);

		await expect(service.getFeaturedUptime("no-such-page")).resolves.toBeNull();
	});

	test("returns null for a page that is not public", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { pageId, slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);
		await drizzleDb.update(statusPage).set({ isPublic: false }).where(eq(statusPage.id, pageId));

		await expect(service.getFeaturedUptime(slug)).resolves.toBeNull();
	});

	test("returns one entry per day of the configured history window", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const result = await service.getFeaturedUptime(slug);

		expect(result?.days).toHaveLength(STATUS_PAGE_HISTORY_DAYS);
	});

	test("a day with no checks is unknown, never up", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);
		await seedCheck(drizzleDb, monitorId, "up", daysAgo(1));

		const result = await service.getFeaturedUptime(slug);

		// -2 is yesterday (seeded); -3 is the day before, which has no checks.
		expect(result?.days.at(-3)).toMatchObject({ status: "unknown", uptimePercent: null });
	});

	test("uptime is null when nothing has been measured at all", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const result = await service.getFeaturedUptime(slug);

		expect(result?.uptimePercent).toBeNull();
	});

	test("a day mixing up and down checks reads as partial", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);
		await seedCheck(drizzleDb, monitorId, "up", daysAgo(1, 9));
		await seedCheck(drizzleDb, monitorId, "down", daysAgo(1, 10));

		const result = await service.getFeaturedUptime(slug);
		const yesterday = result?.days.at(-2);

		expect(yesterday?.status).toBe("partial");
	});

	test("a day whose checks all failed reads as down", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);
		await seedCheck(drizzleDb, monitorId, "down", daysAgo(1, 9));
		await seedCheck(drizzleDb, monitorId, "down", daysAgo(1, 10));

		const result = await service.getFeaturedUptime(slug);

		expect(result?.days.at(-2)?.status).toBe("down");
	});

	test("aggregates every monitor on the page into one band", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const firstMonitor = await seedMonitor(drizzleDb, orgId);
		const { pageId, slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, firstMonitor);

		const secondMonitor = await seedMonitor(drizzleDb, orgId);
		await drizzleDb.insert(statusPageMonitor).values({
			id: `spm-${nanoid()}`,
			statusPageId: pageId,
			monitorId: secondMonitor,
			order: 1,
		});

		await seedCheck(drizzleDb, firstMonitor, "up", daysAgo(1, 9));
		await seedCheck(drizzleDb, secondMonitor, "down", daysAgo(1, 10));

		const result = await service.getFeaturedUptime(slug);

		// One band, not one per monitor: the second monitor's failure has to show.
		expect(result?.days.at(-2)).toMatchObject({ status: "partial", uptimePercent: 50 });
	});

	test("checks older than the window are excluded", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);
		await seedCheck(drizzleDb, monitorId, "down", daysAgo(STATUS_PAGE_HISTORY_DAYS + 5));

		const result = await service.getFeaturedUptime(slug);

		expect(result?.uptimePercent).toBeNull();
	});
});

describe("StatusPageService.getPublicStatusPage — unmeasured days", () => {
	test("a day with no checks is unknown, not a green day nobody measured", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);
		await seedCheck(drizzleDb, monitorId, "up", daysAgo(1));

		const result = await service.getPublicStatusPage(slug);
		const [monitorStatus] = result!.ungroupedMonitors;

		expect(monitorStatus.dailyHistory.at(-3)).toMatchObject({
			status: "unknown",
			uptimePercent: null,
		});
	});

	test("uptime over a window with no checks is null, not 100", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new StatusPageService(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const monitorId = await seedMonitor(drizzleDb, orgId);
		const { slug } = await seedStatusPageWithMonitor(drizzleDb, orgId, monitorId);

		const result = await service.getPublicStatusPage(slug);
		const [monitorStatus] = result!.ungroupedMonitors;

		expect(monitorStatus.uptimePercent90d).toBeNull();
	});
});
