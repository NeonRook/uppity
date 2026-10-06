import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { statusPage } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedMember, seedMonitor, seedOrg, seedSubscription } from "../test/seed";
import {
	collectBlockSnapshots,
	collectUsageSnapshots,
	sumBlocksByCustomer,
	sumByCustomer,
	type OrganizationUsageSnapshot,
} from "./usage-snapshot";

async function seedStatusPage(drizzleDb: TestDb["db"], orgId: string): Promise<void> {
	const suffix = nanoid();
	await drizzleDb.insert(statusPage).values({
		id: nanoid(),
		organizationId: orgId,
		name: `Status Page ${suffix}`,
		slug: `status-${suffix}`,
	});
}

describe("collectUsageSnapshots", () => {
	test("counts monitors, status pages and members for a billed organization", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		await seedSubscription(db.db, orgId, { polarCustomerId: "polar-cust-1" });
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
		const orgId = await seedOrg(db.db);
		await seedSubscription(db.db, orgId, { polarCustomerId: null });
		await seedMonitor(db.db, orgId);

		const snapshots = await collectUsageSnapshots(db.db);

		expect(snapshots.some((s) => s.organizationId === orgId)).toBe(false);
	});

	test("excludes an organization downgraded to free even though it still carries a polarCustomerId, while its sibling keeps reporting its own counts", async ({
		db,
	}) => {
		// downgradeToFree routes through syncFromPolar, which never clears
		// polarCustomerId (it carries `?? existing.polarCustomerId` forward), so a
		// revoked/downgraded organization keeps its Polar customer ID forever.
		// Two organizations sharing one customer — one still paid, one downgraded
		// to free — reproduces the exact shape that would otherwise inflate the
		// customer's summed total.
		const sharedCustomerId = `polar-cust-shared-${nanoid()}`;
		const paidOrg = await seedOrg(db.db);
		const downgradedOrg = await seedOrg(db.db);
		await seedSubscription(db.db, paidOrg, { polarCustomerId: sharedCustomerId, planId: "uppity" });
		await seedSubscription(db.db, downgradedOrg, {
			polarCustomerId: sharedCustomerId,
			planId: "free",
		});
		for (let i = 0; i < 4; i++) await seedMonitor(db.db, paidOrg);
		for (let i = 0; i < 9; i++) await seedMonitor(db.db, downgradedOrg);

		const snapshots = await collectUsageSnapshots(db.db);
		const matching = snapshots.filter((s) => s.polarCustomerId === sharedCustomerId);

		expect(matching).toHaveLength(1);
		expect(matching[0]).toEqual({
			organizationId: paidOrg,
			polarCustomerId: sharedCustomerId,
			monitors: 4,
			statusPages: 0,
			teamMembers: 0,
		});
	});

	test("keeps a past_due organization in the snapshot — it is still on a paid plan", async ({
		db,
	}) => {
		const orgId = await seedOrg(db.db);
		await seedSubscription(db.db, orgId, {
			polarCustomerId: "polar-cust-past-due",
			planId: "uppity",
			status: "past_due",
		});
		await seedMonitor(db.db, orgId);

		const snapshots = await collectUsageSnapshots(db.db);

		expect(snapshots.some((s) => s.organizationId === orgId)).toBe(true);
	});

	test("attributes counts to the right organization when several are billed", async ({ db }) => {
		const first = await seedOrg(db.db);
		const second = await seedOrg(db.db);
		await seedSubscription(db.db, first, { polarCustomerId: "polar-cust-a" });
		await seedSubscription(db.db, second, { polarCustomerId: "polar-cust-b" });
		await seedMonitor(db.db, first);
		await seedMonitor(db.db, second);
		await seedMonitor(db.db, second);

		const snapshots = await collectUsageSnapshots(db.db);

		expect(snapshots.find((s) => s.organizationId === first)?.monitors).toBe(1);
		expect(snapshots.find((s) => s.organizationId === second)?.monitors).toBe(2);
	});

	test("reports zero for a billed organization with no resources", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		await seedSubscription(db.db, orgId, { polarCustomerId: "polar-cust-empty" });

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
		const first = await seedOrg(db.db);
		const second = await seedOrg(db.db);
		await seedSubscription(db.db, first, { polarCustomerId: sharedCustomerId });
		await seedSubscription(db.db, second, { polarCustomerId: sharedCustomerId });
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

describe("collectBlockSnapshots", () => {
	test("reports the stored block count for a block-eligible organization", async ({ db }) => {
		const { db: drizzleDb } = db;
		const polarCustomerId = `polar-cust-${nanoid()}`;
		const orgId = await seedOrg(drizzleDb);
		await seedSubscription(drizzleDb, orgId, { polarCustomerId: polarCustomerId, blocks: 3 });

		const rows = await collectBlockSnapshots(drizzleDb, polarCustomerId);

		expect(rows).toEqual([{ organizationId: orgId, polarCustomerId, blocks: 3 }]);
	});

	test("keeps an organization holding zero blocks", async ({ db }) => {
		const { db: drizzleDb } = db;
		const polarCustomerId = `polar-cust-${nanoid()}`;
		const orgId = await seedOrg(drizzleDb);
		await seedSubscription(drizzleDb, orgId, { polarCustomerId: polarCustomerId, blocks: 0 });

		expect(await collectBlockSnapshots(drizzleDb, polarCustomerId)).toEqual([
			{ organizationId: orgId, polarCustomerId, blocks: 0 },
		]);
	});

	test("excludes plans that carry no metered block price", async ({ db }) => {
		const { db: drizzleDb } = db;
		const dedicatedCustomer = `polar-cust-${nanoid()}`;
		const freeCustomer = `polar-cust-${nanoid()}`;

		await seedSubscription(drizzleDb, await seedOrg(drizzleDb), {
			polarCustomerId: dedicatedCustomer,
			planId: "dedicated",
			blocks: 4,
		});
		await seedSubscription(drizzleDb, await seedOrg(drizzleDb), {
			polarCustomerId: freeCustomer,
			planId: "free",
			blocks: 4,
		});

		expect(await collectBlockSnapshots(drizzleDb, dedicatedCustomer)).toEqual([]);
		expect(await collectBlockSnapshots(drizzleDb, freeCustomer)).toEqual([]);
	});

	test("excludes organizations with no Polar customer", async ({ db }) => {
		const { db: drizzleDb } = db;
		const orgId = await seedOrg(drizzleDb);
		await seedSubscription(drizzleDb, orgId, { polarCustomerId: null, blocks: 2 });

		const rows = await collectBlockSnapshots(drizzleDb);

		expect(rows.some((row) => row.organizationId === orgId)).toBe(false);
	});

	test("returns one row per organization when several share one Polar customer", async ({ db }) => {
		const { db: drizzleDb } = db;
		const polarCustomerId = `polar-cust-${nanoid()}`;
		const first = await seedOrg(drizzleDb);
		const second = await seedOrg(drizzleDb);
		await seedSubscription(drizzleDb, first, { polarCustomerId: polarCustomerId, blocks: 1 });
		await seedSubscription(drizzleDb, second, { polarCustomerId: polarCustomerId, blocks: 2 });

		const rows = await collectBlockSnapshots(drizzleDb, polarCustomerId);

		expect(rows).toHaveLength(2);
		expect(new Map(rows.map((row) => [row.organizationId, row.blocks]))).toEqual(
			new Map([
				[first, 1],
				[second, 2],
			]),
		);
	});

	test("omitting the customer filter reports every block-eligible organization", async ({ db }) => {
		const { db: drizzleDb } = db;
		const polarCustomerId = `polar-cust-${nanoid()}`;
		const orgId = await seedOrg(drizzleDb);
		await seedSubscription(drizzleDb, orgId, { polarCustomerId: polarCustomerId, blocks: 5 });

		const rows = await collectBlockSnapshots(drizzleDb);

		expect(rows.find((row) => row.organizationId === orgId)?.blocks).toBe(5);
	});
});

describe("sumBlocksByCustomer", () => {
	it("sums the blocks a customer holds across its organizations", () => {
		const summed = sumBlocksByCustomer([
			{ organizationId: "org-1", polarCustomerId: "polar-cust-a", blocks: 2 },
			{ organizationId: "org-2", polarCustomerId: "polar-cust-a", blocks: 3 },
		]);

		expect(summed).toEqual([{ polarCustomerId: "polar-cust-a", blocks: 5, organizationCount: 2 }]);
	});

	it("keeps distinct customers separate", () => {
		const summed = sumBlocksByCustomer([
			{ organizationId: "org-1", polarCustomerId: "polar-cust-a", blocks: 1 },
			{ organizationId: "org-2", polarCustomerId: "polar-cust-b", blocks: 4 },
		]);

		expect(summed).toEqual([
			{ polarCustomerId: "polar-cust-a", blocks: 1, organizationCount: 1 },
			{ polarCustomerId: "polar-cust-b", blocks: 4, organizationCount: 1 },
		]);
	});

	it("returns an empty array for no rows", () => {
		expect(sumBlocksByCustomer([])).toEqual([]);
	});
});
