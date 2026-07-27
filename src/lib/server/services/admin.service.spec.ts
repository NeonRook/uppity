import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { member, organization, user } from "../db/auth-schema";
import { auditLog } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { AdminService } from "./admin.service";
import { AuditService, type Actor } from "./audit.service";

// The `db` fixture is file-scoped, so rows accumulate across tests in this file.
// Every assertion is scoped to the actor the test seeded.
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

async function makeActor(drizzleDb: TestDb["db"]): Promise<Actor> {
	const id = await seedUser(drizzleDb);
	return { id, email: `${id}@example.com`, ip: "198.51.100.4", userAgent: "vitest" };
}

function auditRowsFor(drizzleDb: TestDb["db"], actor: Actor) {
	return drizzleDb.select().from(auditLog).where(eq(auditLog.actorId, actor.id));
}

function auditRowFor(drizzleDb: TestDb["db"], actor: Actor, action: string) {
	return drizzleDb
		.select()
		.from(auditLog)
		.where(and(eq(auditLog.actorId, actor.id), eq(auditLog.action, action)));
}

/**
 * Stands in for `auth.api`. Better Auth's API is bound to its own database
 * handle and cannot be pointed at the fixture database, so this seam is the
 * only way to assert audit behaviour for Better-Auth-mediated mutations.
 */
function stubAuthApi(overrides: Record<string, unknown> = {}) {
	const calls: { method: string; body?: unknown }[] = [];
	const record = (method: string) => async (args: { body?: unknown }) => {
		calls.push({ method, body: args?.body });
		return { status: true };
	};
	return {
		calls,
		api: {
			banUser: record("banUser"),
			unbanUser: record("unbanUser"),
			setRole: record("setRole"),
			listUserSessions: async () => ({ sessions: [] }),
			revokeUserSession: record("revokeUserSession"),
			revokeUserSessions: record("revokeUserSessions"),
			impersonateUser: record("impersonateUser"),
			stopImpersonating: record("stopImpersonating"),
			...overrides,
		},
	};
}

function makeService(drizzleDb: TestDb["db"], authApi: unknown = stubAuthApi().api): AdminService {
	return new AdminService(drizzleDb, new AuditService(drizzleDb), authApi as never);
}

describe("AdminService.createOrganization", () => {
	test("writes exactly one org.create audit row", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = makeService(drizzleDb);
		const actor = await makeActor(drizzleDb);
		const slug = `acme-${nanoid(6)}`;

		const org = await service.createOrganization(actor, { name: "Acme", slug });

		const rows = await auditRowsFor(drizzleDb, actor);
		expect(rows).toHaveLength(1);
		expect(rows[0].action).toBe("org.create");
		expect(rows[0].targetType).toBe("organization");
		expect(rows[0].targetId).toBe(org.id);
		expect(rows[0].targetLabel).toBe("Acme");
		expect(rows[0].metadata).toEqual({ slug });
	});
});

describe("AdminService.updateOrganization", () => {
	test("records only the fields that actually changed", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = makeService(drizzleDb);
		const actor = await makeActor(drizzleDb);
		const slug = `acme-${nanoid(6)}`;
		const org = await service.createOrganization(actor, { name: "Acme", slug });

		await service.updateOrganization(actor, org.id, { name: "Acme Corp", slug });

		const [row] = await auditRowFor(drizzleDb, actor, "org.update");
		expect(row.metadata).toEqual({ changed: ["name"] });
	});

	test("returns null and writes nothing for an unknown organization", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = makeService(drizzleDb);
		const actor = await makeActor(drizzleDb);

		const result = await service.updateOrganization(actor, "no-such-org", { name: "X" });

		expect(result).toBeNull();
		expect(await auditRowsFor(drizzleDb, actor)).toHaveLength(0);
	});
});

describe("AdminService.deleteOrganization", () => {
	test("keeps the audit row readable after the org is gone", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = makeService(drizzleDb);
		const actor = await makeActor(drizzleDb);
		const slug = `doomed-${nanoid(6)}`;
		const org = await service.createOrganization(actor, { name: "Doomed", slug });
		const userId = await seedUser(drizzleDb);
		await service.addMemberToOrg(actor, org.id, userId, "member");

		await service.deleteOrganization(actor, org.id);

		const [row] = await auditRowFor(drizzleDb, actor, "org.delete");
		expect(row.targetLabel).toBe("Doomed");
		expect(row.metadata).toEqual({ slug, memberCount: 1 });

		const orgs = await drizzleDb.select().from(organization).where(eq(organization.id, org.id));
		expect(orgs).toHaveLength(0);
	});
});

describe("AdminService member mutations", () => {
	test("records member add and remove against the member row", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = makeService(drizzleDb);
		const actor = await makeActor(drizzleDb);
		const orgId = await seedOrg(drizzleDb);
		const userId = await seedUser(drizzleDb);

		const added = await service.addMemberToOrg(actor, orgId, userId, "admin");

		const [addRow] = await auditRowFor(drizzleDb, actor, "org.member_add");
		expect(addRow.targetType).toBe("member");
		expect(addRow.targetId).toBe(added.id);
		expect(addRow.targetLabel).toBe(`${userId}@example.com`);
		expect(addRow.metadata).toEqual({ orgId, userId, role: "admin" });

		await service.removeMemberFromOrg(actor, added.id);

		const [removeRow] = await auditRowFor(drizzleDb, actor, "org.member_remove");
		expect(removeRow.metadata).toEqual({ orgId, userId });

		const members = await drizzleDb.select().from(member).where(eq(member.id, added.id));
		expect(members).toHaveLength(0);
	});

	test("removing a member that does not exist writes no audit row", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = makeService(drizzleDb);
		const actor = await makeActor(drizzleDb);

		const removed = await service.removeMemberFromOrg(actor, "no-such-member");

		expect(removed).toBe(false);
		expect(await auditRowsFor(drizzleDb, actor)).toHaveLength(0);
	});
});

describe("AdminService.banUser", () => {
	test("calls the auth API and records one user.ban row", async ({ db }) => {
		const { db: drizzleDb } = db;
		const stub = stubAuthApi();
		const service = makeService(drizzleDb, stub.api);
		const actor = await makeActor(drizzleDb);
		const victimId = await seedUser(drizzleDb);

		await service.banUser(actor, new Headers(), victimId, "v@example.com", "spam");

		expect(stub.calls).toEqual([
			{ method: "banUser", body: { userId: victimId, banReason: "spam" } },
		]);

		const rows = await auditRowsFor(drizzleDb, actor);
		expect(rows).toHaveLength(1);
		expect(rows[0].action).toBe("user.ban");
		expect(rows[0].targetType).toBe("user");
		expect(rows[0].targetId).toBe(victimId);
		expect(rows[0].metadata).toEqual({ reason: "spam" });
	});

	test("writes no audit row when the auth call fails", async ({ db }) => {
		const { db: drizzleDb } = db;
		const stub = stubAuthApi({
			banUser: async () => {
				throw new Error("auth exploded");
			},
		});
		const service = makeService(drizzleDb, stub.api);
		const actor = await makeActor(drizzleDb);

		await expect(service.banUser(actor, new Headers(), "victim", "v@example.com")).rejects.toThrow(
			"auth exploded",
		);

		expect(await auditRowsFor(drizzleDb, actor)).toHaveLength(0);
	});
});

describe("AdminService.setUserRole", () => {
	test("records the transition in metadata", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = makeService(drizzleDb);
		const actor = await makeActor(drizzleDb);

		await service.setUserRole(actor, new Headers(), "u1", "admin", "user", "u1@example.com");

		const [row] = await auditRowsFor(drizzleDb, actor);
		expect(row.action).toBe("user.role_change");
		expect(row.metadata).toEqual({ from: "user", to: "admin" });
	});
});

describe("AdminService.revokeAllUserSessions", () => {
	test("records how many sessions were revoked", async ({ db }) => {
		const { db: drizzleDb } = db;
		const stub = stubAuthApi({
			listUserSessions: async () => ({ sessions: [{ token: "a" }, { token: "b" }] }),
		});
		const service = makeService(drizzleDb, stub.api);
		const actor = await makeActor(drizzleDb);

		await service.revokeAllUserSessions(actor, new Headers(), "u1", "u1@example.com");

		const [row] = await auditRowsFor(drizzleDb, actor);
		expect(row.action).toBe("user.sessions_revoke_all");
		expect(row.targetType).toBe("user");
		expect(row.metadata).toEqual({ count: 2 });
	});
});

describe("AdminService.stopImpersonating", () => {
	test("records the admin as the actor, not the impersonated user", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = makeService(drizzleDb);
		const adminActor = await makeActor(drizzleDb);
		const victimId = await seedUser(drizzleDb);

		await service.stopImpersonating(adminActor, new Headers(), victimId, "v@example.com");

		const [row] = await auditRowsFor(drizzleDb, adminActor);
		expect(row.action).toBe("user.impersonate_stop");
		expect(row.actorId).toBe(adminActor.id);
		expect(row.targetId).toBe(victimId);
	});
});
