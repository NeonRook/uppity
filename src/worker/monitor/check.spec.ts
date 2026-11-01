import { createServer } from "node:http";
import net, { type AddressInfo } from "node:net";

import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import {
	monitor as monitorTable,
	monitorCheck,
	monitorStatus,
	type Monitor,
} from "../../lib/server/db/schema";
import { WideEventBuilder, type CheckWideEvent } from "../../lib/server/logger";
import { test } from "../../lib/server/test/fixture";
import type { TestDb } from "../../lib/server/test/harness";
import { seedMonitor, seedOrg } from "../../lib/server/test/seed";
import { executeCheck, runCheck } from "./check";

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

describe("executeCheck when a target misbehaves", () => {
	beforeEach(() => vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true"));
	afterEach(() => vi.unstubAllEnvs());

	test("records a stored URL that does not parse as a down result", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await monitorWith(drizzleDb, { type: "http", url: "not a url", retries: 0 });

		await executeCheck(monitor, drizzleDb);

		const rows = await drizzleDb
			.select()
			.from(monitorCheck)
			.where(eq(monitorCheck.monitorId, monitor.id));
		expect(rows).toMatchObject([{ status: "down", errorMessage: "URL is not valid" }]);
	});

	test("logs a connection dropped mid-body as a result, not an error", async ({ db }) => {
		const { db: drizzleDb } = db;
		const server = createServer((_req, res) => {
			res.writeHead(200, { "content-length": "100" });
			res.write("partial", () => res.destroy());
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		const monitor = await monitorWith(drizzleDb, {
			type: "http",
			url: `http://127.0.0.1:${port}/`,
			expectedBodyContains: "absent",
			retries: 0,
		});
		const { log, event } = eventFor(monitor);

		await executeCheck(monitor, drizzleDb, event);
		event.emit("check");
		server.close();

		expect(log.error).not.toHaveBeenCalled();
		expect(log.info.mock.calls[0][0]).toMatchObject({
			status: "success",
			check_status: "down",
			check_error: expect.stringMatching(/^Check failed \(.+\)$/),
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
		expect(check.errorMessage).toBe("Blocked: localhost resolves to a private address");
	});
});

function eventFor(monitor: Monitor) {
	const log = { info: vi.fn(), error: vi.fn() };
	const event = new WideEventBuilder<CheckWideEvent>(
		log as unknown as Logger,
		"monitor_check",
		monitor.id,
	);
	return { log, event };
}

function downMonitor(drizzleDb: TestDb["db"]) {
	return monitorWith(drizzleDb, { type: "http", url: null, retries: 0 });
}

describe("executeCheck's wide event", () => {
	test("logs a down target as a successful check, with no stack", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await downMonitor(drizzleDb);
		const { log, event } = eventFor(monitor);

		await executeCheck(monitor, drizzleDb, event);
		event.emit("check");

		expect(log.error).not.toHaveBeenCalled();
		const [fields] = log.info.mock.calls[0] as [Record<string, unknown>];
		expect(fields).toMatchObject({
			status: "success",
			check_status: "down",
			check_error: "No URL configured",
		});
		expect(fields).not.toHaveProperty("error_stack");
	});

	test("keeps the outcome when the processor skips the row", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await downMonitor(drizzleDb);
		await drizzleDb
			.update(monitorStatus)
			.set({ lastCheckAt: new Date(Date.now() + 60_000) })
			.where(eq(monitorStatus.monitorId, monitor.id));
		const { log, event } = eventFor(monitor);

		await executeCheck(monitor, drizzleDb, event);
		event.emit("check");

		expect(log.info.mock.calls[0][0]).toMatchObject({
			check_status: "down",
			check_error: "No URL configured",
		});
	});

	test("keeps the outcome when processing fails", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await downMonitor(drizzleDb);
		const { log, event } = eventFor(monitor);
		const failing = Object.assign(Object.create(drizzleDb) as TestDb["db"], {
			transaction: () => Promise.reject(new Error("deadlock")),
		});

		await expect(executeCheck(monitor, failing, event)).rejects.toThrow("deadlock");
		event.emit("check");

		expect(log.info.mock.calls[0][0]).toMatchObject({ check_status: "down" });
	});

	test("leaves a failed write to the caller, unmarked as success", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await downMonitor(drizzleDb);
		await drizzleDb.delete(monitorTable).where(eq(monitorTable.id, monitor.id));
		const { event } = eventFor(monitor);
		const setSuccess = vi.spyOn(event, "setSuccess");

		await expect(executeCheck(monitor, drizzleDb, event)).rejects.toThrow("Failed query");

		expect(setSuccess).not.toHaveBeenCalled();
	});
});

describe("a checker failure", () => {
	beforeEach(() => vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true"));
	afterEach(() => vi.unstubAllEnvs());

	test("from inside a probe logs an error and still records the result", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await monitorWith(drizzleDb, {
			type: "tcp",
			hostname: "127.0.0.1",
			port: 70_000,
			retries: 0,
		});
		const { log, event } = eventFor(monitor);

		await runCheck(monitor, drizzleDb, event);

		expect(log.error.mock.calls[0][0]).toMatchObject({
			status: "error",
			error_type: "RangeError",
			error_stack: expect.stringContaining("RangeError"),
			check_status: "down",
		});
		const [check] = await checksOf(drizzleDb, monitor.id);
		expect(check.status).toBe("down");
	});

	test("thrown out of the check logs an error and backs the monitor off", async ({ db }) => {
		const { db: drizzleDb } = db;
		const monitor = await downMonitor(drizzleDb);
		const { log, event } = eventFor(monitor);
		const failing = Object.assign(Object.create(drizzleDb) as TestDb["db"], {
			transaction: vi
				.fn(drizzleDb.transaction.bind(drizzleDb))
				.mockRejectedValueOnce(new TypeError("deadlock")),
		});

		await runCheck(monitor, failing, event);

		expect(log.info).not.toHaveBeenCalled();
		expect(log.error.mock.calls[0][0]).toMatchObject({
			status: "error",
			error_type: "TypeError",
			error_stack: expect.stringContaining("TypeError"),
		});
		const [row] = await drizzleDb
			.select({ retries: monitorTable.checkRetryCount })
			.from(monitorTable)
			.where(eq(monitorTable.id, monitor.id));
		expect(row.retries).toBe(1);
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
