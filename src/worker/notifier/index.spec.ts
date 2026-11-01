import http from "node:http";
import type { AddressInfo } from "node:net";

import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, vi } from "vitest";

import { CHECK_RETRY } from "../../lib/constants/worker";
import type { Db } from "../../lib/server/db/index";
import { monitor, opsAlertCooldown } from "../../lib/server/db/schema";
import { test } from "../../lib/server/test/fixture";
import { seedMonitor, seedOrg } from "../../lib/server/test/seed";
import { recordCheckFailure, recordCheckSuccess } from "../monitor/schedule";

const sweep = () => vi.advanceTimersByTimeAsync(5 * 60 * 1000);

const shared = vi.hoisted(() => ({
	db: undefined as unknown,
	client: { listen: () => Promise.resolve({ unlisten: () => Promise.resolve() }) },
}));

vi.mock("../shared/db", () => ({
	get db() {
		return shared.db;
	},
	get client() {
		return shared.client;
	},
}));

interface Payload {
	embeds: { title: string; description: string }[];
	allowed_mentions: unknown;
}

/** A Discord stand-in that records every attempt and answers `hook.status`. */
async function webhookServer() {
	const hook = { status: 204, attempts: [] as Payload[], url: "", close: () => {} };
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			hook.attempts.push(JSON.parse(Buffer.concat(chunks).toString()) as Payload);
			res.writeHead(hook.status).end();
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	hook.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks/1/token`;
	hook.close = () => server.close();
	return hook;
}

const setOverdue = (db: Db, id: string) =>
	db
		.update(monitor)
		.set({ nextCheckAt: sql`NOW() - INTERVAL '1 hour'`, checkBackoffUntil: null })
		.where(eq(monitor.id, id));

const setOnSchedule = (db: Db, id: string) =>
	db
		.update(monitor)
		.set({ nextCheckAt: sql`NOW() + INTERVAL '5 minutes'`, checkBackoffUntil: null })
		.where(eq(monitor.id, id));

async function load(db: Db, id: string) {
	const [row] = await db.select().from(monitor).where(eq(monitor.id, id));
	return row;
}

/** Drives a monitor into dead letter through the path the monitor worker uses. */
async function deadLetter(db: Db, id: string, error: Error): Promise<void> {
	for (let i = 0; i < CHECK_RETRY.MAX_ATTEMPTS; i++) {
		await recordCheckFailure(db, await load(db, id), error);
	}
}

const schedulerCooldown = (db: Db) =>
	db
		.select()
		.from(opsAlertCooldown)
		.where(eq(opsAlertCooldown.key, "monitor_checks_overdue:scheduler"));

const hostListeners = {
	SIGTERM: process.listeners("SIGTERM"),
	SIGINT: process.listeners("SIGINT"),
};
const added = (signal: "SIGTERM" | "SIGINT") =>
	process.listeners(signal).filter((listener) => !hostListeners[signal].includes(listener));

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

afterAll(() => {
	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		for (const listener of added(signal)) process.off(signal, listener);
	}
});

describe("notifier ops alerts, from the sweep timer to the webhook", () => {
	test("alerts on dead letter and overdue checks, once per outage", async ({ db }) => {
		const { db: drizzleDb } = db;
		const hook = await webhookServer();
		vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true");
		vi.stubEnv("UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL", hook.url);
		const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

		const orgId = await seedOrg(drizzleDb);
		const overdueId = await seedMonitor(drizzleDb, orgId);
		const deadId = await seedMonitor(drizzleDb, orgId);
		await drizzleDb
			.update(monitor)
			.set({ name: "@everyone [click](https://evil.example)" })
			.where(eq(monitor.id, deadId));
		const failure = new Error("connect https://user:hunter2@customer.example failed");
		await deadLetter(drizzleDb, deadId, failure);
		await setOverdue(drizzleDb, overdueId);

		shared.db = drizzleDb;
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		await import("./index");
		await vi.waitFor(() => expect(vi.getTimerCount()).toBe(2));

		// The first sweep reports both.
		await sweep();
		await vi.waitFor(() => expect(hook.attempts).toHaveLength(2));
		expect(hook.attempts.map(({ embeds }) => embeds[0].title).toSorted()).toEqual([
			"Dead-lettered monitors: 1",
			"Monitors are not being checked",
		]);
		const sent = JSON.stringify(hook.attempts);
		expect(sent).toContain(deadId);
		expect(sent).toContain("/admin/dead-letters");
		expect(sent).not.toMatch(/everyone|evil|hunter2|customer\.example/);
		expect(hook.attempts[0].allowed_mentions).toEqual({ parse: [] });

		// The same outage stays quiet: the final count would be higher otherwise.
		await sweep();

		// A recovery clears the cooldown, so the next outage alerts inside six hours.
		await setOnSchedule(drizzleDb, overdueId);
		await sweep();
		await vi.waitFor(async () => expect(await schedulerCooldown(drizzleDb)).toEqual([]));
		await setOverdue(drizzleDb, overdueId);
		await sweep();
		await vi.waitFor(() => expect(hook.attempts).toHaveLength(3));
		expect(hook.attempts[2].embeds[0].title).toBe("Monitors are not being checked");

		// A monitor that recovers and dead-letters again is a new failure.
		await recordCheckSuccess(drizzleDb, await load(drizzleDb, deadId));
		await deadLetter(drizzleDb, deadId, failure);
		await sweep();
		await vi.waitFor(() => expect(hook.attempts).toHaveLength(4));
		expect(hook.attempts[3].embeds[0].title).toBe("Dead-lettered monitors: 1");

		// A rejected send retries on each sweep, one attempt each.
		hook.status = 500;
		await setOnSchedule(drizzleDb, overdueId);
		await sweep();
		await vi.waitFor(async () => expect(await schedulerCooldown(drizzleDb)).toEqual([]));
		await setOverdue(drizzleDb, overdueId);
		await sweep();
		await vi.waitFor(() => expect(hook.attempts).toHaveLength(5));
		await vi.waitFor(async () => expect(await schedulerCooldown(drizzleDb)).toEqual([]));
		await sweep();
		await vi.waitFor(() => expect(hook.attempts).toHaveLength(6));

		// Stopping waits for sends in flight, so this count is final.
		const [stop] = added("SIGTERM");
		stop("SIGTERM");
		await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
		hook.close();

		expect(hook.attempts).toHaveLength(6);
	});
});
