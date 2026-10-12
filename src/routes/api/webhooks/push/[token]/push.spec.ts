import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, vi } from "vitest";

import { organization } from "#lib/server/db/auth-schema.js";
import { monitor, monitorCheck, monitorStatus } from "#lib/server/db/schema.js";
import { test } from "#lib/server/test/fixture.js";

const current = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("#lib/server/db/index.js", () => ({
	get db() {
		return current.db;
	},
}));

const { GET } = await import("./+server.js");

describe("push webhook", () => {
	test("records an unprocessed up result and leaves the status to the processor", async ({
		db,
	}) => {
		current.db = db.db;
		const suffix = nanoid();
		const orgId = `test-org-${suffix}`;
		const id = `mon-${suffix}`;
		const token = `tok-${suffix}`;
		await db.db
			.insert(organization)
			.values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
		await db.db
			.insert(monitor)
			.values({ id, organizationId: orgId, name: "Cron", type: "push", pushToken: token });
		await db.db.insert(monitorStatus).values({ monitorId: id, status: "down" });

		const res = await GET({ params: { token } } as Parameters<typeof GET>[0]);
		expect(res.status).toBe(200);

		const checks = await db.db.select().from(monitorCheck).where(eq(monitorCheck.monitorId, id));
		expect(checks).toMatchObject([{ status: "up", processedAt: null }]);
		const [status] = await db.db
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, id));
		expect(status.status).toBe("down");
	});
});
