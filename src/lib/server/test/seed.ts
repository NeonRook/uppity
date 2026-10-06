import { nanoid } from "nanoid";

import { member, organization, user } from "../db/auth-schema";
import type { Db } from "../db/index";
import { monitor, subscription } from "../db/schema";

export async function seedOrg(db: Db): Promise<string> {
	const suffix = nanoid();
	const orgId = `test-org-${suffix}`;
	await db.insert(organization).values({
		id: orgId,
		name: `Test Org ${suffix}`,
		slug: orgId,
		createdAt: new Date(),
	});
	return orgId;
}

export async function seedUser(db: Db): Promise<string> {
	const userId = `test-user-${nanoid()}`;
	await db.insert(user).values({
		id: userId,
		name: "Test User",
		email: `${userId}@example.com`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	return userId;
}

export async function seedMember(db: Db, orgId: string, role = "member"): Promise<string> {
	const userId = await seedUser(db);
	await db.insert(member).values({
		id: nanoid(),
		organizationId: orgId,
		userId,
		role,
		createdAt: new Date(),
	});
	return userId;
}

export async function seedMonitor(db: Db, orgId: string): Promise<string> {
	const id = `mon-${nanoid()}`;
	await db.insert(monitor).values({
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

export async function seedMonitors(db: Db, orgId: string, count: number): Promise<void> {
	for (let i = 0; i < count; i++) await seedMonitor(db, orgId);
}

/** An active Uppity subscription with no purchased blocks unless `overrides` say otherwise. */
export async function seedSubscription(
	db: Db,
	orgId: string,
	overrides: Partial<typeof subscription.$inferInsert> = {},
): Promise<void> {
	await db.insert(subscription).values({
		id: nanoid(),
		organizationId: orgId,
		planId: "uppity",
		status: "active",
		blocks: 0,
		...overrides,
	});
}
