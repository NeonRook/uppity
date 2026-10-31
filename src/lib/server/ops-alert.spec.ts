import http from "node:http";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import * as schema from "./db/schema";
import { clearOpsAlert, raiseOpsAlert, type OpsAlert } from "./ops-alert";
import { test } from "./test/fixture";

const { opsAlertCooldown } = schema;

const { sendMail, logged } = vi.hoisted(() => ({
	sendMail: vi.fn(),
	logged: vi.fn(),
}));

vi.mock("./smtp", () => ({ smtpFrom: "uppity@example.com", smtpTransport: { sendMail } }));
vi.mock("./logger", async (importOriginal) => ({
	...(await importOriginal<typeof import("./logger")>()),
	childLogger: () => ({ warn: logged, error: logged }),
}));

const alert = (subject = nanoid()): OpsAlert => ({
	type: "monitor_checks_overdue",
	subject,
	title: "Monitors are not being checked",
	body: "3 active monitors are past due.",
});

/** A webhook endpoint answering `status`, or never answering. */
async function webhookServer(status: number | "hang" = 204) {
	const bodies: unknown[] = [];
	const server = http.createServer((req, res) => {
		if (status === "hang") return;
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
			res.writeHead(status).end();
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}/api/webhooks/1/secret-token`,
		bodies,
		close: () => server.closeAllConnections(),
	};
}

beforeEach(() => {
	vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true");
	sendMail.mockReset().mockResolvedValue({});
	logged.mockReset();
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("raiseOpsAlert", () => {
	test("with no destination set, it sends, stores and logs nothing", async ({ db }) => {
		const subject = nanoid();

		await raiseOpsAlert(db.db, alert(subject));

		expect(sendMail).not.toHaveBeenCalled();
		expect(logged).not.toHaveBeenCalled();
		expect(
			await db.db
				.select()
				.from(opsAlertCooldown)
				.where(eq(opsAlertCooldown.key, `monitor_checks_overdue:${subject}`)),
		).toEqual([]);
	});

	test("sends to both destinations", async ({ db }) => {
		const hook = await webhookServer();
		vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
		vi.stubEnv("UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL", hook.url);

		await raiseOpsAlert(db.db, alert());
		hook.close();

		expect(sendMail).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				to: "ops@example.com",
				subject: "[Uppity ops] Monitors are not being checked",
				text: "3 active monitors are past due.",
			}),
		);
		expect(hook.bodies).toEqual([
			{
				allowed_mentions: { parse: [] },
				embeds: [
					expect.objectContaining({
						title: "Monitors are not being checked",
						description: "3 active monitors are past due.",
					}),
				],
			},
		]);
	});

	test("repeats only after the cooldown, keyed on type and subject", async ({ db }) => {
		vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
		const repeated = alert();

		await raiseOpsAlert(db.db, repeated);
		await raiseOpsAlert(db.db, repeated);
		expect(sendMail).toHaveBeenCalledTimes(1);

		await raiseOpsAlert(db.db, alert());
		await raiseOpsAlert(db.db, { ...repeated, type: "monitor_dead_lettered" });
		expect(sendMail).toHaveBeenCalledTimes(3);
	});

	test("clearing the cooldown lets the next outage alert at once", async ({ db }) => {
		vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
		const repeated = alert();

		await raiseOpsAlert(db.db, repeated);
		await clearOpsAlert(db.db, repeated);
		await raiseOpsAlert(db.db, repeated);

		expect(sendMail).toHaveBeenCalledTimes(2);
	});

	test("with no destination set, clearing touches nothing", async () => {
		const deleteRow = vi.fn();
		await clearOpsAlert({ delete: deleteRow } as never, alert());
		expect(deleteRow).not.toHaveBeenCalled();
	});

	test("the cooldown survives a restart and ends on time", async ({ db }) => {
		vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
		const repeated = alert();
		await raiseOpsAlert(db.db, repeated);

		vi.resetModules();
		const restarted = await import("./ops-alert");
		await restarted.raiseOpsAlert(db.db, repeated);
		expect(sendMail).toHaveBeenCalledTimes(1);

		await db.db
			.update(opsAlertCooldown)
			.set({ sentAt: sql`NOW() - INTERVAL '7 hours'` })
			.where(eq(opsAlertCooldown.key, `${repeated.type}:${repeated.subject}`));
		await restarted.raiseOpsAlert(db.db, repeated);
		expect(sendMail).toHaveBeenCalledTimes(2);
	});

	test("one destination failing does not stop the other or reopen the cooldown", async ({ db }) => {
		const hook = await webhookServer();
		vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
		vi.stubEnv("UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL", hook.url);
		sendMail.mockRejectedValue(new Error("SMTP down"));
		const repeated = alert();

		await raiseOpsAlert(db.db, repeated);
		await raiseOpsAlert(db.db, repeated);
		hook.close();

		expect(hook.bodies).toHaveLength(1);
		expect(sendMail).toHaveBeenCalledTimes(1);
	});

	test("makes one attempt, and an undelivered alert may go out on the next raise", async ({
		db,
	}) => {
		vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
		sendMail.mockRejectedValueOnce(new Error("SMTP down"));
		const repeated = alert();

		await raiseOpsAlert(db.db, repeated);
		expect(sendMail).toHaveBeenCalledTimes(1);

		await raiseOpsAlert(db.db, repeated);
		expect(sendMail).toHaveBeenCalledTimes(2);
	});

	test("gives up on a destination that never answers", async ({ db }) => {
		const hook = await webhookServer("hang");
		vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
		vi.stubEnv("UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL", hook.url);
		sendMail.mockReturnValue(new Promise(() => {}));

		await raiseOpsAlert(db.db, alert(), 50);
		hook.close();

		expect(logged).toHaveBeenCalledTimes(2);
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({ error: "Timed out after 50ms" }),
			"Ops alert not delivered",
		);
	});

	test("a database that is down neither stops the alert nor lets it repeat", async () => {
		vi.stubEnv("UPPITY_OPS_ALERT_EMAIL", "ops@example.com");
		const client = postgres("postgres://nobody@127.0.0.1:1/nothing", { connect_timeout: 1 });
		const unreachable = drizzle(client, { schema });
		const repeated = alert();

		await raiseOpsAlert(unreachable, repeated);
		await raiseOpsAlert(unreachable, repeated);

		expect(sendMail).toHaveBeenCalledTimes(1);
	});

	test("keeps the webhook URL out of the logs, even when it does not parse", async ({ db }) => {
		for (const url of [
			"not a url secret-token",
			"http://127.0.0.1:1/api/webhooks/1/secret-token",
		]) {
			vi.stubEnv("UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL", url);
			await raiseOpsAlert(db.db, alert());
		}

		expect(logged).toHaveBeenCalledTimes(2);
		expect(inspect(logged.mock.calls, { depth: null })).not.toContain("secret-token");
	});
});
