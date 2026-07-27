import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect } from "vitest";

import { user } from "../db/auth-schema";
import { auditLog } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { AuditService, type Actor } from "./audit.service";

// The `db` fixture is file-scoped: every test in this file shares one database,
// so rows accumulate across tests. Each test seeds its own actor and scopes its
// assertions to that actor's id rather than assuming an empty table.
async function seedActor(drizzleDb: TestDb["db"]): Promise<Actor> {
	const suffix = nanoid();
	const userId = `test-user-${suffix}`;
	await drizzleDb.insert(user).values({
		id: userId,
		name: "Test Admin",
		email: `${userId}@example.com`,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	return { id: userId, email: `${userId}@example.com`, ip: null, userAgent: null };
}

describe("audit_log schema", () => {
	test("accepts a row and reads it back", async ({ db }) => {
		const { db: drizzleDb } = db;
		const actor = await seedActor(drizzleDb);

		await drizzleDb.insert(auditLog).values({
			id: nanoid(),
			actorId: actor.id,
			actorEmail: actor.email,
			action: "user.ban",
			targetType: "user",
			targetId: "victim-1",
			targetLabel: "victim@example.com",
			metadata: { reason: "spam" },
		});

		const rows = await drizzleDb.select().from(auditLog).where(eq(auditLog.actorId, actor.id));
		expect(rows).toHaveLength(1);
		expect(rows[0].metadata).toEqual({ reason: "spam" });
	});
});

describe("AuditService.record", () => {
	test("persists every field including denormalized actor and target", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new AuditService(drizzleDb);
		const actor = await seedActor(drizzleDb);

		const row = await service.record(
			drizzleDb,
			{ ...actor, ip: "203.0.113.7", userAgent: "curl/8.0" },
			{
				action: "org.delete",
				targetType: "organization",
				targetId: "org-123",
				targetLabel: "Acme Inc",
				metadata: { slug: "acme", memberCount: 4 },
			},
		);

		expect(row.actorId).toBe(actor.id);
		expect(row.actorEmail).toBe(actor.email);
		expect(row.action).toBe("org.delete");
		expect(row.targetType).toBe("organization");
		expect(row.targetId).toBe("org-123");
		expect(row.targetLabel).toBe("Acme Inc");
		expect(row.metadata).toEqual({ slug: "acme", memberCount: 4 });
		expect(row.ipAddress).toBe("203.0.113.7");
		expect(row.userAgent).toBe("curl/8.0");
		expect(row.createdAt).toBeInstanceOf(Date);
	});

	test("writes inside a caller-supplied transaction and rolls back with it", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new AuditService(drizzleDb);
		const actor = await seedActor(drizzleDb);

		await expect(
			drizzleDb.transaction(async (tx) => {
				await service.record(tx, actor, {
					action: "org.create",
					targetType: "organization",
					targetId: "org-x",
				});
				throw new Error("caller failed after the audit write");
			}),
		).rejects.toThrow("caller failed after the audit write");

		const rows = await drizzleDb.select().from(auditLog).where(eq(auditLog.actorId, actor.id));
		expect(rows).toHaveLength(0);
	});

	test("survives deletion of the actor, keeping the denormalized email", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new AuditService(drizzleDb);
		const actor = await seedActor(drizzleDb);
		const targetId = `victim-${nanoid()}`;

		await service.record(drizzleDb, actor, {
			action: "user.ban",
			targetType: "user",
			targetId,
			targetLabel: "v@example.com",
		});
		await drizzleDb.delete(user).where(eq(user.id, actor.id));

		const [row] = await drizzleDb.select().from(auditLog).where(eq(auditLog.targetId, targetId));
		expect(row.actorId).toBeNull();
		expect(row.actorEmail).toBe(actor.email);
		expect(row.targetLabel).toBe("v@example.com");
	});
});

describe("AuditService.list", () => {
	/** Seeds three entries owned by a fresh actor: two `user.ban`, one `org.delete`. */
	async function seedEntries(drizzleDb: TestDb["db"]) {
		const service = new AuditService(drizzleDb);
		const actor = await seedActor(drizzleDb);
		const tag = nanoid(6);

		await service.record(drizzleDb, actor, {
			action: "user.ban",
			targetType: "user",
			targetId: `u1-${tag}`,
		});
		await service.record(drizzleDb, actor, {
			action: "org.delete",
			targetType: "organization",
			targetId: `o1-${tag}`,
		});
		await service.record(drizzleDb, actor, {
			action: "user.ban",
			targetType: "user",
			targetId: `u2-${tag}`,
		});

		return { service, actor, tag };
	}

	test("returns newest first", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { service, actor, tag } = await seedEntries(drizzleDb);

		const { entries, total } = await service.list({ actorId: actor.id });

		expect(total).toBe(3);
		expect(entries).toHaveLength(3);
		expect(entries[0].targetId).toBe(`u2-${tag}`);
	});

	test("narrows by action", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { service, actor } = await seedEntries(drizzleDb);

		const { entries, total } = await service.list({ actorId: actor.id, action: "user.ban" });

		expect(total).toBe(2);
		expect(entries.every((e) => e.action === "user.ban")).toBe(true);
	});

	test("narrows by target type and id together", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { service, tag } = await seedEntries(drizzleDb);

		const { entries } = await service.list({ targetType: "user", targetId: `u1-${tag}` });

		expect(entries).toHaveLength(1);
		expect(entries[0].targetId).toBe(`u1-${tag}`);
	});

	test("narrows by actor", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { service } = await seedEntries(drizzleDb);
		const other = await seedActor(drizzleDb);
		await service.record(drizzleDb, other, {
			action: "user.unban",
			targetType: "user",
			targetId: `u3-${nanoid(6)}`,
		});

		const { total } = await service.list({ actorId: other.id });

		expect(total).toBe(1);
	});

	test("narrows by date range", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new AuditService(drizzleDb);
		const actor = await seedActor(drizzleDb);
		const targetId = `u1-${nanoid(6)}`;

		await service.record(drizzleDb, actor, {
			action: "user.ban",
			targetType: "user",
			targetId,
		});
		await drizzleDb
			.update(auditLog)
			.set({ createdAt: new Date("2020-01-01T00:00:00Z") })
			.where(eq(auditLog.targetId, targetId));

		const excluded = await service.list({
			actorId: actor.id,
			from: new Date("2021-01-01T00:00:00Z"),
		});
		const included = await service.list({
			actorId: actor.id,
			to: new Date("2021-01-01T00:00:00Z"),
		});

		expect(excluded.total).toBe(0);
		expect(included.total).toBe(1);
	});

	test("reports total independently of limit and offset", async ({ db }) => {
		const { db: drizzleDb } = db;
		const { service, actor } = await seedEntries(drizzleDb);

		const { entries, total } = await service.list({ actorId: actor.id, limit: 1, offset: 1 });

		expect(total).toBe(3);
		expect(entries).toHaveLength(1);
	});
});

describe("AuditService.exportCsv", () => {
	test("emits a header row and one row per entry", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new AuditService(drizzleDb);
		const actor = await seedActor(drizzleDb);
		await service.record(
			drizzleDb,
			{ ...actor, ip: "10.0.0.1", userAgent: "curl" },
			{ action: "user.ban", targetType: "user", targetId: "u1", targetLabel: "v@example.com" },
		);

		const csv = await service.exportCsv({ actorId: actor.id });
		const lines = csv.trim().split("\n");

		expect(lines[0]).toBe(
			"created_at,actor_email,action,target_type,target_id,target_label,ip_address,metadata",
		);
		expect(lines).toHaveLength(2);
		expect(lines[1]).toContain(actor.email);
	});

	test("escapes commas and quotes in metadata so the cell round-trips", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new AuditService(drizzleDb);
		const actor = await seedActor(drizzleDb);
		const metadata = { reason: 'spam, lots of it and a "quote"' };
		await service.record(drizzleDb, actor, {
			action: "user.ban",
			targetType: "user",
			targetId: "u1",
			metadata,
		});

		const csv = await service.exportCsv({ actorId: actor.id });
		const lines = csv.trim().split("\n");

		// The embedded comma must not split the row, and the embedded quote must
		// not terminate the cell early.
		expect(lines).toHaveLength(2);

		const quotedCell = lines[1].slice(lines[1].indexOf(',"{') + 1);
		const unwrapped = quotedCell.slice(1, -1).replaceAll('""', '"');
		expect(JSON.parse(unwrapped)).toEqual(metadata);
	});

	test("honours the same filters as list", async ({ db }) => {
		const { db: drizzleDb } = db;
		const service = new AuditService(drizzleDb);
		const actor = await seedActor(drizzleDb);
		await service.record(drizzleDb, actor, { action: "user.ban", targetType: "user" });
		await service.record(drizzleDb, actor, { action: "org.delete", targetType: "organization" });

		const csv = await service.exportCsv({ actorId: actor.id, action: "org.delete" });

		expect(csv.trim().split("\n")).toHaveLength(2);
	});
});
