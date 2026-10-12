import { createServer } from "node:http";
import net, { type AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import {
	monitor as monitorTable,
	monitorCheck,
	monitorStatus,
	type Monitor,
} from "../../lib/server/db/schema";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { seedMonitor, seedOrg } from "../../lib/server/test/seed";
import { executeCheck } from "./check";

async function monitorWith(
	drizzleDb: TestDb["db"],
	values: Partial<typeof monitorTable.$inferInsert>,
): Promise<Monitor> {
	const id = await seedMonitor(drizzleDb, await seedOrg(drizzleDb));
	const [row] = await drizzleDb
		.update(monitorTable)
		.set(values)
		.where(eq(monitorTable.id, id))
		.returning();
	await drizzleDb.insert(monitorStatus).values({ monitorId: id, status: "unknown" });
	return row;
}

function checksOf(drizzleDb: TestDb["db"], monitorId: string) {
	return drizzleDb
		.select()
		.from(monitorCheck)
		.where(eq(monitorCheck.monitorId, monitorId))
		.orderBy(monitorCheck.checkedAt);
}

async function statusOf(drizzleDb: TestDb["db"], monitorId: string): Promise<string> {
	const [row] = await drizzleDb
		.select({ status: monitorStatus.status })
		.from(monitorStatus)
		.where(eq(monitorStatus.monitorId, monitorId));
	return row.status;
}

describe("executeCheck over HTTP", () => {
	beforeEach(() => vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true"));
	afterEach(() => vi.unstubAllEnvs());

	test("opens a fresh connection for every check and records it processed", async ({ db }) => {
		const { db: drizzleDb } = db;
		let sockets = 0;
		const server = createServer((_req, res) => res.end("ok"));
		server.on("connection", () => sockets++);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;

		try {
			const monitor = await monitorWith(drizzleDb, { url: `http://127.0.0.1:${port}/` });

			await executeCheck(monitor, drizzleDb);
			await executeCheck(monitor, drizzleDb);

			const checks = await checksOf(drizzleDb, monitor.id);
			expect(checks.map((c) => c.status)).toEqual(["up", "up"]);
			expect(checks.every((c) => Number.isInteger(c.responseTimeMs))).toBe(true);
			expect(checks.every((c) => c.processedAt !== null)).toBe(true);
			expect(sockets).toBe(2);
			expect(await statusOf(drizzleDb, monitor.id)).toBe("up");
		} finally {
			server.closeAllConnections();
			server.close();
		}
	});

	test("refuses a private address unless the operator allows it", async ({ db }) => {
		const { db: drizzleDb } = db;
		vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "");
		const monitor = await monitorWith(drizzleDb, { url: "http://127.0.0.1:9/" });

		await executeCheck(monitor, drizzleDb);

		const [check] = await checksOf(drizzleDb, monitor.id);
		expect(check).toMatchObject({
			status: "down",
			errorMessage: "Blocked: 127.0.0.1 is a private address",
		});
	});
});

describe("executeCheck over TCP", () => {
	afterEach(() => vi.unstubAllEnvs());

	test("records an open port as up", async ({ db }) => {
		const { db: drizzleDb } = db;
		vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true");
		const server = net.createServer((socket) => socket.end());
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;

		try {
			const monitor = await monitorWith(drizzleDb, {
				type: "tcp",
				url: null,
				hostname: "127.0.0.1",
				port,
			});
			await executeCheck(monitor, drizzleDb);

			expect((await checksOf(drizzleDb, monitor.id)).map((c) => c.status)).toEqual(["up"]);
		} finally {
			server.close();
		}
	});

	test("refuses a host that resolves to a private address", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await monitorWith(drizzleDb, {
			type: "tcp",
			url: null,
			hostname: "localhost",
			port: 5432,
		});
		await executeCheck(monitor, drizzleDb);

		const [check] = await checksOf(drizzleDb, monitor.id);
		expect(check.status).toBe("down");
		expect(check.errorMessage).toMatch(/^Blocked: localhost resolves to private address /);
	});
});

describe("executeCheck for a push monitor", () => {
	const overdue = new Date(Date.now() - 3_600_000);

	test("records a missed heartbeat as down", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await monitorWith(drizzleDb, {
			type: "push",
			url: null,
			intervalSeconds: 60,
			pushGracePeriodSeconds: 60,
			createdAt: overdue,
		});

		await executeCheck(monitor, drizzleDb);

		const checks = await checksOf(drizzleDb, monitor.id);
		expect(checks).toMatchObject([{ status: "down", errorMessage: "No heartbeat received" }]);
		expect(await statusOf(drizzleDb, monitor.id)).toBe("down");
	});

	test("writes nothing while heartbeats arrive, and interprets them", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await monitorWith(drizzleDb, {
			type: "push",
			url: null,
			intervalSeconds: 60,
			pushGracePeriodSeconds: 60,
			createdAt: overdue,
		});
		await drizzleDb
			.insert(monitorCheck)
			.values({ id: `hb-${monitor.id}`, monitorId: monitor.id, status: "up", responseTimeMs: 0 });

		await executeCheck(monitor, drizzleDb);

		const checks = await checksOf(drizzleDb, monitor.id);
		expect(checks).toHaveLength(1);
		expect(checks[0].processedAt).not.toBeNull();
		expect(await statusOf(drizzleDb, monitor.id)).toBe("up");
	});

	test("a young monitor with no heartbeat yet writes nothing", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await monitorWith(drizzleDb, { type: "push", url: null });

		await executeCheck(monitor, drizzleDb);

		expect(await checksOf(drizzleDb, monitor.id)).toEqual([]);
		expect(await statusOf(drizzleDb, monitor.id)).toBe("unknown");
	});
});
