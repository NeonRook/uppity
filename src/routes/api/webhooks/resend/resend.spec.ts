import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, describe, expect, vi } from "vitest";

import { emailSuppression } from "#lib/server/db/schema.js";
import { verifySignature } from "#lib/server/resend-webhook.js";
import { test } from "#lib/server/test/fixture.js";
import type { TestDb } from "#lib/server/test/harness.js";

const current = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("#lib/server/db/index.js", () => ({
	get db() {
		return current.db;
	},
}));

const { POST } = await import("./+server.js");

const SECRET = `whsec_${Buffer.from("test-signing-key").toString("base64")}`;

function sign(id: string, timestamp: string, body: string) {
	const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
	const digest = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
	return `v1,${digest}`;
}

function deliver(body: string, overrides: Record<string, string | undefined> = {}) {
	const id = overrides.id ?? nanoid();
	const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
	const signature = "signature" in overrides ? overrides.signature : sign(id, timestamp, body);
	const headers = new Headers({ "svix-id": id, "svix-timestamp": timestamp });
	if (signature) headers.set("svix-signature", signature);
	const request = new Request("http://localhost/api/webhooks/resend", {
		method: "POST",
		headers,
		body,
	});
	return POST({ request } as Parameters<typeof POST>[0]);
}

/** The status of a delivery, whether the handler returned it or threw it. */
async function statusOf(delivery: ReturnType<typeof deliver>): Promise<number> {
	try {
		return (await delivery).status;
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
}

const bounce = (to: string, type = "Permanent") =>
	JSON.stringify({
		type: "email.bounced",
		created_at: new Date().toISOString(),
		data: { created_at: new Date().toISOString(), to: [to], bounce: { type } },
	});

const complaint = (to: string) =>
	JSON.stringify({
		type: "email.complained",
		created_at: new Date().toISOString(),
		data: { created_at: new Date().toISOString(), to: [to] },
	});

async function suppression(drizzle: TestDb["db"], email: string) {
	const [row] = await drizzle
		.select()
		.from(emailSuppression)
		.where(eq(emailSuppression.email, email));
	return row;
}

describe("verifySignature", () => {
	const vector = {
		id: "msg_loFOjxBNrRLzqYUf",
		timestamp: "1731705121",
		signature: "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
		body: '{"event_type":"ping","data":{"success":true}}',
	};
	const secret = "whsec_plJ3nmyCDGBKInavdOK15jsl";
	const signedAt = 1731705121_000;

	test("accepts Svix's published test vector, among other signatures", () => {
		expect.assertions(2);
		expect(verifySignature(secret, vector, signedAt)).toBe(true);
		const rotated = { ...vector, signature: `v1,b2xk ${vector.signature}` };
		expect(verifySignature(secret, rotated, signedAt)).toBe(true);
	});

	test("refuses a tampered body and a timestamp past the tolerance", () => {
		expect.assertions(2);
		expect(verifySignature(secret, { ...vector, body: "{}" }, signedAt)).toBe(false);
		expect(verifySignature(secret, vector, signedAt + 6 * 60_000)).toBe(false);
	});
});

describe("Resend webhook", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("refuses every request without a configured secret", async ({ db }) => {
		current.db = db.db;
		vi.stubEnv("RESEND_WEBHOOK_SECRET", "");

		expect(await statusOf(deliver(bounce("a@example.com")))).toBe(503);
		expect(await suppression(db.db, "a@example.com")).toBeUndefined();
	});

	test("refuses a missing, forged, or stale signature", async ({ db }) => {
		current.db = db.db;
		vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
		const body = bounce("a@example.com");
		const stale = String(Math.floor(Date.now() / 1000) - 3600);

		expect(await statusOf(deliver(body, { signature: undefined }))).toBe(401);
		expect(await statusOf(deliver(body, { signature: "v1,Zm9yZ2Vk" }))).toBe(401);
		expect(await statusOf(deliver(body, { timestamp: stale }))).toBe(401);
		expect(await suppression(db.db, "a@example.com")).toBeUndefined();
	});

	test("a hard bounce suppresses the lowercased address", async ({ db }) => {
		current.db = db.db;
		vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);

		expect(await statusOf(deliver(bounce("Gone@Example.com")))).toBe(204);

		expect(await suppression(db.db, "gone@example.com")).toMatchObject({ reason: "bounce" });
	});

	test("a complaint suppresses the address", async ({ db }) => {
		current.db = db.db;
		vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);

		await deliver(complaint("angry@example.com"));

		expect(await suppression(db.db, "angry@example.com")).toMatchObject({ reason: "complaint" });
	});

	test("a temporary bounce and other event types change nothing", async ({ db }) => {
		current.db = db.db;
		vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);

		const temporary = await statusOf(deliver(bounce("busy@example.com", "Temporary")));
		const delivered = await statusOf(
			deliver(JSON.stringify({ type: "email.delivered", data: {} })),
		);

		expect([temporary, delivered]).toEqual([204, 204]);
		expect(await suppression(db.db, "busy@example.com")).toBeUndefined();
	});

	test("answers a retry without repeating the work", async ({ db }) => {
		current.db = db.db;
		vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
		const id = nanoid();

		await deliver(bounce("gone@example.com"), { id });
		await db.db.delete(emailSuppression).where(eq(emailSuppression.email, "gone@example.com"));
		expect(await statusOf(deliver(bounce("gone@example.com"), { id }))).toBe(204);

		expect(await suppression(db.db, "gone@example.com")).toBeUndefined();
	});

	test("rejects a signed bounce in an unknown shape so the provider retries", async ({ db }) => {
		current.db = db.db;
		vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);

		const body = JSON.stringify({ type: "email.bounced", data: {} });

		expect(await statusOf(deliver(body))).toBe(400);
	});
});
