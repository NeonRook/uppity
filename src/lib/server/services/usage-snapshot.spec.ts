import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { member, organization, user } from "../db/auth-schema";
import { monitor, statusPage, subscription } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import {
	collectUsageSnapshots,
	sumByCustomer,
	type OrganizationUsageSnapshot,
} from "./usage-snapshot";

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

async function seedSubscription(
	drizzleDb: TestDb["db"],
	orgId: string,
	polarCustomerId: string | null,
): Promise<void> {
	await drizzleDb.insert(subscription).values({
		id: nanoid(),
		organizationId: orgId,
		planId: "uppity",
		status: "active",
		polarCustomerId,
	});
}

async function seedMonitor(drizzleDb: TestDb["db"], orgId: string): Promise<void> {
	await drizzleDb.insert(monitor).values({
		id: nanoid(),
		organizationId: orgId,
		name: `Monitor ${nanoid()}`,
		type: "http",
		url: "https://example.com",
	});
}

async function seedStatusPage(drizzleDb: TestDb["db"], orgId: string): Promise<void> {
	const suffix = nanoid();
	await drizzleDb.insert(statusPage).values({
		id: nanoid(),
		organizationId: orgId,
		name: `Status Page ${suffix}`,
		slug: `status-${suffix}`,
	});
}

async function seedMember(drizzleDb: TestDb["db"], orgId: string): Promise<void> {
	const suffix = nanoid();
	const userId = `test-user-${suffix}`;
	await drizzleDb.insert(user).values({
		id: userId,
		name: `Test User ${suffix}`,
		email: `user-${suffix}@example.com`,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	await drizzleDb.insert(member).values({
		id: nanoid(),
		organizationId: orgId,
		userId,
		role: "member",
		createdAt: new Date(),
	});
}

describe("collectUsageSnapshots", () => {
	test("counts monitors, status pages and members for a billed organization", async ({ db }) => {
		const orgId = await seedOrganization(db.db);
		await seedSubscription(db.db, orgId, "polar-cust-1");
		await seedMonitor(db.db, orgId);
		await seedMonitor(db.db, orgId);
		await seedStatusPage(db.db, orgId);
		await seedMember(db.db, orgId);
		await seedMember(db.db, orgId);
		await seedMember(db.db, orgId);

		const snapshots = await collectUsageSnapshots(db.db);
		const row = snapshots.find((s) => s.organizationId === orgId);

		expect(row).toEqual({
			organizationId: orgId,
			polarCustomerId: "polar-cust-1",
			monitors: 2,
			statusPages: 1,
			teamMembers: 3,
		});
	});

	test("excludes organizations with no Polar customer", async ({ db }) => {
		const orgId = await seedOrganization(db.db);
		await seedSubscription(db.db, orgId, null);
		await seedMonitor(db.db, orgId);

		const snapshots = await collectUsageSnapshots(db.db);

		expect(snapshots.some((s) => s.organizationId === orgId)).toBe(false);
	});

	test("attributes counts to the right organization when several are billed", async ({ db }) => {
		const first = await seedOrganization(db.db);
		const second = await seedOrganization(db.db);
		await seedSubscription(db.db, first, "polar-cust-a");
		await seedSubscription(db.db, second, "polar-cust-b");
		await seedMonitor(db.db, first);
		await seedMonitor(db.db, second);
		await seedMonitor(db.db, second);

		const snapshots = await collectUsageSnapshots(db.db);

		expect(snapshots.find((s) => s.organizationId === first)?.monitors).toBe(1);
		expect(snapshots.find((s) => s.organizationId === second)?.monitors).toBe(2);
	});

	test("reports zero for a billed organization with no resources", async ({ db }) => {
		const orgId = await seedOrganization(db.db);
		await seedSubscription(db.db, orgId, "polar-cust-empty");

		const snapshots = await collectUsageSnapshots(db.db);

		expect(snapshots.find((s) => s.organizationId === orgId)).toEqual({
			organizationId: orgId,
			polarCustomerId: "polar-cust-empty",
			monitors: 0,
			statusPages: 0,
			teamMembers: 0,
		});
	});

	test("returns one row per organization even when several share one Polar customer", async ({
		db,
	}) => {
		// Two organizations owned by the same better-auth user share one Polar
		// customer (subscription.polarCustomerId is not unique per organization).
		// Collapsing them into one billable total is sumByCustomer's job, not
		// this query's — collectUsageSnapshots stays per-organization so the
		// usage_snapshot_org audit stream has something to key on.
		const sharedCustomerId = "polar-cust-shared";
		const first = await seedOrganization(db.db);
		const second = await seedOrganization(db.db);
		await seedSubscription(db.db, first, sharedCustomerId);
		await seedSubscription(db.db, second, sharedCustomerId);
		await seedMonitor(db.db, first);
		await seedMonitor(db.db, second);

		const snapshots = await collectUsageSnapshots(db.db);
		const matching = snapshots.filter((s) => s.polarCustomerId === sharedCustomerId);

		expect(matching).toHaveLength(2);
		expect(new Set(matching.map((s) => s.organizationId))).toEqual(new Set([first, second]));
	});
});

function usageSnapshotRow(
	overrides: Partial<OrganizationUsageSnapshot>,
): OrganizationUsageSnapshot {
	return {
		organizationId: nanoid(),
		polarCustomerId: "polar-cust-default",
		monitors: 0,
		statusPages: 0,
		teamMembers: 0,
		...overrides,
	};
}

describe("sumByCustomer", () => {
	it("leaves a single-org customer's counts unchanged, with organizationCount 1", () => {
		const rows = [
			usageSnapshotRow({
				organizationId: "org-1",
				polarCustomerId: "polar-cust-1",
				monitors: 2,
				statusPages: 1,
				teamMembers: 3,
			}),
		];

		expect(sumByCustomer(rows)).toEqual([
			{
				polarCustomerId: "polar-cust-1",
				monitors: 2,
				statusPages: 1,
				teamMembers: 3,
				organizationCount: 1,
			},
		]);
	});

	it("sums counts across organizations sharing one customer", () => {
		const rows = [
			usageSnapshotRow({
				organizationId: "org-1",
				polarCustomerId: "polar-cust-shared",
				monitors: 3,
				statusPages: 1,
				teamMembers: 0,
			}),
			usageSnapshotRow({
				organizationId: "org-2",
				polarCustomerId: "polar-cust-shared",
				monitors: 4,
				statusPages: 0,
				teamMembers: 1,
			}),
		];

		expect(sumByCustomer(rows)).toEqual([
			{
				polarCustomerId: "polar-cust-shared",
				monitors: 7,
				statusPages: 1,
				teamMembers: 1,
				organizationCount: 2,
			},
		]);
	});

	it("keeps distinct customers separate", () => {
		const rows = [
			usageSnapshotRow({ organizationId: "org-1", polarCustomerId: "polar-cust-a", monitors: 1 }),
			usageSnapshotRow({ organizationId: "org-2", polarCustomerId: "polar-cust-b", monitors: 2 }),
		];

		const summed = sumByCustomer(rows);

		expect(summed.find((s) => s.polarCustomerId === "polar-cust-a")).toMatchObject({
			monitors: 1,
			organizationCount: 1,
		});
		expect(summed.find((s) => s.polarCustomerId === "polar-cust-b")).toMatchObject({
			monitors: 2,
			organizationCount: 1,
		});
	});

	it("returns an empty array for no rows", () => {
		expect(sumByCustomer([])).toEqual([]);
	});
});
