import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, vi } from "vitest";

import { organization } from "#lib/server/db/auth-schema.js";
import {
	incident,
	incidentMonitor,
	monitor,
	monitorStatus,
	notificationEvent,
} from "#lib/server/db/schema.js";
import { test } from "#lib/server/test/fixture.js";

import { executeCheck } from "../../../../../worker/monitor/check";

const current = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("#lib/server/db/index.js", () => ({
	get db() {
		return current.db;
	},
}));

const { GET } = await import("./+server.js");

describe("push monitor recovery", () => {
	// The webhook writes monitor_status itself, so the worker never sees the down → up change.
	// Passes once every result goes through one processor (ADR 0007).
	test(
		"a heartbeat after an outage alerts up and resolves the incident",
		{ fails: true },
		async ({ db }) => {
			current.db = db.db;
			const suffix = nanoid();
			const orgId = `test-org-${suffix}`;
			const token = `tok-${suffix}`;
			await db.db
				.insert(organization)
				.values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
			await db.db.insert(monitor).values({
				id: `mon-${suffix}`,
				organizationId: orgId,
				name: "Nightly backup",
				type: "push",
				pushToken: token,
				intervalSeconds: 60,
				pushGracePeriodSeconds: 60,
				createdAt: new Date(Date.now() - 3_600_000),
			});
			await db.db.insert(monitorStatus).values({ monitorId: `mon-${suffix}`, status: "up" });
			const [mon] = await db.db.select().from(monitor).where(eq(monitor.pushToken, token));

			// No heartbeat for an hour: the worker marks it down and opens an incident.
			await executeCheck(mon, db.db);

			const res = await GET({ params: { token } } as Parameters<typeof GET>[0]);
			expect(res.status).toBe(200);

			// The next check finds the fresh heartbeat.
			await executeCheck(mon, db.db);

			const events = await db.db
				.select({ type: notificationEvent.type })
				.from(notificationEvent)
				.where(eq(notificationEvent.monitorId, mon.id));
			expect(events.map((e) => e.type)).toEqual(["monitor_down", "monitor_up"]);

			const [opened] = await db.db
				.select({ status: incident.status })
				.from(incident)
				.innerJoin(incidentMonitor, eq(incidentMonitor.incidentId, incident.id))
				.where(and(eq(incidentMonitor.monitorId, mon.id), eq(incident.isAutoCreated, true)));
			expect(opened?.status).toBe("resolved");
		},
	);
});
