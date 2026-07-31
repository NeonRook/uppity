import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { member, organization, user } from "../db/auth-schema";
import { monitor, statusPage, subscription } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { collectUsageSnapshots } from "./usage-snapshot";

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

		expect(snapshots.find((s) => s.organizationId === orgId)).toBeUndefined();
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

		expect(snapshots.find((s) => s.organizationId === orgId)).toMatchObject({
			monitors: 0,
			statusPages: 0,
			teamMembers: 0,
		});
	});
});
