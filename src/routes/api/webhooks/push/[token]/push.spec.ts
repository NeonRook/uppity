import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, vi } from "vitest";

import { organization } from "#lib/server/db/auth-schema.js";
import { monitor, monitorStatus } from "#lib/server/db/schema.js";
import { test } from "#lib/server/test/fixture.js";
import type { TestDb } from "#lib/server/test/harness.js";

const current = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("#lib/server/db/index.js", () => ({
	get db() {
		return current.db;
	},
}));

const { GET } = await import("./+server.js");

async function seedPushMonitor(
	{ db }: TestDb,
	status: string,
	lastStatusChange: Date | null,
): Promise<string> {
	const suffix = nanoid();
	const orgId = `test-org-${suffix}`;
	const id = `mon-${suffix}`;
	await db
		.insert(organization)
		.values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
	await db
		.insert(monitor)
		.values({ id, organizationId: orgId, name: "Cron", type: "push", pushToken: `tok-${suffix}` });
	await db.insert(monitorStatus).values({ monitorId: id, status, lastStatusChange });
	return `tok-${suffix}`;
}

describe("push webhook", () => {
	test("stamps the status change only when recovering from down", async ({ db }) => {
		current.db = db.db;
		const earlier = new Date("2026-01-01T00:00:00Z");

		const downToken = await seedPushMonitor(db, "down", earlier);
		const upToken = await seedPushMonitor(db, "up", earlier);

		for (const token of [downToken, upToken]) {
			const res = await GET({ params: { token } } as Parameters<typeof GET>[0]);
			expect(res.status).toBe(200);
		}

		const rows = await db.db.select().from(monitorStatus);
		const byToken = async (token: string) => {
			const [mon] = await db.db.select().from(monitor).where(eq(monitor.pushToken, token));
			return rows.find((r) => r.monitorId === mon.id)!;
		};

		const recovered = await byToken(downToken);
		expect(recovered.status).toBe("up");
		expect(recovered.lastStatusChange!.getTime()).toBeGreaterThan(earlier.getTime());

		const steady = await byToken(upToken);
		expect(steady.lastStatusChange!.getTime()).toBe(earlier.getTime());
	});
});
