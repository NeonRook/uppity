import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import * as schema from "../../lib/server/db/schema";
import { raiseOpsAlert } from "../../lib/server/ops-alert";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { seedMonitor, seedOrg } from "../../lib/server/test/seed";
import { reportDeadLetters, reportOverdueChecks } from "./watchdog";

vi.mock("../../lib/server/ops-alert", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../lib/server/ops-alert")>()),
	raiseOpsAlert: vi.fn(),
}));

const { monitor } = schema;
const raised = vi.mocked(raiseOpsAlert);

beforeEach(() => {
	raised.mockReset();
	vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

/** A database whose reads never answer. */
const hangingDb = {
	select: () => ({
		from: () => {
			const hung = new Promise(() => {});
			return { where: () => Object.assign(hung, { orderBy: () => ({ limit: () => hung }) }) };
		},
	}),
} as never;

/** Seeds active monitors dead-lettered one minute apart, the last one newest. */
async function seedDeadLettered(drizzleDb: TestDb["db"], count: number): Promise<string[]> {
	await drizzleDb.update(monitor).set({ active: false });
	const orgId = await seedOrg(drizzleDb);
	const ids: string[] = [];
	for (let i = 0; i < count; i++) {
		const id = await seedMonitor(drizzleDb, orgId);
		await drizzleDb
			.update(monitor)
			.set({
				checkLastError: "probe bug",
				deadLetteredAt: sql`NOW() - make_interval(mins => ${count - i})`,
				nextCheckAt: sql`NOW() + INTERVAL '5 minutes'`,
			})
			.where(eq(monitor.id, id));
		ids.push(id);
	}
	return ids;
}

describe("reportOverdueChecks", () => {
	test("stays quiet while every monitor is on schedule", async ({ db }) => {
		await db.db.update(monitor).set({ active: false });

		await reportOverdueChecks(db.db);

		expect(raised).not.toHaveBeenCalled();
	});

	test("raises one alert for the whole scheduler", async ({ db }) => {
		const { db: drizzleDb } = db;
		await drizzleDb.update(monitor).set({ active: false });
		const orgId = await seedOrg(drizzleDb);
		const ids = [await seedMonitor(drizzleDb, orgId), await seedMonitor(drizzleDb, orgId)];
		await drizzleDb
			.update(monitor)
			.set({ nextCheckAt: sql`NOW() - INTERVAL '1 hour'`, checkBackoffUntil: null })
			.where(inArray(monitor.id, ids));

		await reportOverdueChecks(drizzleDb);

		expect(raised).toHaveBeenCalledExactlyOnceWith(
			drizzleDb,
			expect.objectContaining({
				type: "monitor_checks_overdue",
				subject: "scheduler",
				body: expect.stringContaining("2 active monitors") as string,
			}),
		);
	});

	test("a database it cannot read is an alert of its own", async () => {
		const client = postgres("postgres://nobody@127.0.0.1:1/nothing", { connect_timeout: 1 });
		const unreachable = drizzle(client, { schema });

		await reportOverdueChecks(unreachable);

		expect(raised).toHaveBeenCalledExactlyOnceWith(
			unreachable,
			expect.objectContaining({
				type: "monitor_checks_overdue",
				subject: "database",
				body: expect.stringContaining("ECONNREFUSED") as string,
			}),
		);
	});

	test("a database that hangs is the same alert, not a silent stall", async () => {
		await reportOverdueChecks(hangingDb, 50);

		expect(raised).toHaveBeenCalledExactlyOnceWith(
			hangingDb,
			expect.objectContaining({
				subject: "database",
				body: expect.stringContaining("Timed out after 50ms") as string,
			}),
		);
	});
});

describe("reportDeadLetters", () => {
	test("with no destination set, it does not read the table", async () => {
		vi.unstubAllEnvs();
		const select = vi.fn();

		await reportDeadLetters({ select } as never);

		expect(select).not.toHaveBeenCalled();
	});

	test("a query that hangs gives up without alerting", async () => {
		await reportDeadLetters(hangingDb, 50);

		expect(raised).not.toHaveBeenCalled();
	});

	test("stays quiet with no dead-lettered monitor", async ({ db }) => {
		await db.db.update(monitor).set({ active: false });

		await reportDeadLetters(db.db);

		expect(raised).not.toHaveBeenCalled();
	});

	test("a paused monitor does not count", async ({ db }) => {
		const [id] = await seedDeadLettered(db.db, 1);
		await db.db.update(monitor).set({ active: false }).where(eq(monitor.id, id));

		await reportDeadLetters(db.db);

		expect(raised).not.toHaveBeenCalled();
	});

	test("many monitors make one alert, keyed on the newest", async ({ db }) => {
		const ids = await seedDeadLettered(db.db, 12);

		await reportDeadLetters(db.db);

		expect(raised).toHaveBeenCalledOnce();
		const [[, alert]] = raised.mock.calls;
		expect(alert).toMatchObject({
			type: "monitor_dead_lettered",
			subject: expect.stringContaining(ids.at(-1) as string) as string,
			title: "Dead-lettered monitors: 12",
		});
		expect(alert.body).toContain("and 2 more");
		expect(alert.body.indexOf("/admin/dead-letters")).toBeLessThan(
			alert.body.indexOf(ids.at(-1) as string),
		);
	});

	test("keeps monitor names and check errors out of the message", async ({ db }) => {
		const [id] = await seedDeadLettered(db.db, 1);
		await db.db
			.update(monitor)
			.set({
				name: "@everyone [click](https://evil.example)",
				checkLastError: "connect https://user:hunter2@customer.example/?token=abc failed",
			})
			.where(eq(monitor.id, id));

		await reportDeadLetters(db.db);

		const [[, alert]] = raised.mock.calls;
		expect(alert.body).toContain(id);
		expect(`${alert.title}${alert.body}`).not.toMatch(/everyone|evil|hunter2|customer\.example/);
	});

	test("a monitor that re-enters dead letter gets a new subject", async ({ db }) => {
		const [id] = await seedDeadLettered(db.db, 1);
		await reportDeadLetters(db.db);
		await db.db
			.update(monitor)
			.set({ deadLetteredAt: sql`NOW()` })
			.where(eq(monitor.id, id));
		await reportDeadLetters(db.db);

		const [[, first], [, second]] = raised.mock.calls;
		expect(second.subject).not.toBe(first.subject);
	});
});
