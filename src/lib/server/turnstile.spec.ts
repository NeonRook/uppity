import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appUrl } from "./account-email";
import { turnstileSiteKey, verifyTurnstile } from "./turnstile";

const { hostname } = new URL(appUrl);

/** What siteverify answers for a token the widget issued for this action on this host. */
const accepted = { success: true, action: "subscribe", hostname, "error-codes": [] };

function answer(body: unknown) {
	const verify = vi.fn(async (..._args: [string, RequestInit]) => Response.json(body));
	vi.stubGlobal("fetch", verify);
	return verify;
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("without keys", () => {
	it("skips the check", async () => {
		const verify = answer({ success: false });

		expect(turnstileSiteKey()).toBeUndefined();
		await expect(verifyTurnstile(null, "subscribe")).resolves.toBe(true);
		expect(verify).not.toHaveBeenCalled();
	});

	it.each([
		["TURNSTILE_SITE_KEY", "site"],
		["TURNSTILE_SECRET_KEY", "secret"],
	])("treats %s alone as unconfigured", async (name, value) => {
		vi.stubEnv(name, value);

		expect(turnstileSiteKey()).toBeUndefined();
		await expect(verifyTurnstile(null, "subscribe")).resolves.toBe(true);
	});
});

describe("with keys", () => {
	beforeEach(() => {
		vi.stubEnv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
		vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
	});

	it("posts the token and secret to Cloudflare with a timeout", async () => {
		const verify = answer(accepted);

		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(true);

		const [[url, init]] = verify.mock.calls;
		const body = init.body as URLSearchParams;
		expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
		expect(body.get("response")).toBe("token");
		expect(body.get("secret")).toBe("1x0000000000000000000000000000000AA");
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it.each([
		["a missing token", null],
		["an empty token", ""],
		["an uploaded file", new File(["x"], "token")],
		["a token over Cloudflare's length limit", "x".repeat(2049)],
	])("refuses %s without calling Cloudflare", async (_, token) => {
		const verify = answer(accepted);

		await expect(verifyTurnstile(token, "subscribe")).resolves.toBe(false);
		expect(verify).not.toHaveBeenCalled();
	});

	it.each([
		["spent or expired", { success: false, "error-codes": ["timeout-or-duplicate"] }],
		["forged", { success: false, "error-codes": ["invalid-input-response"] }],
		["issued for another form", { ...accepted, action: "signup" }],
		["issued on another site", { ...accepted, hostname: "evil.example" }],
		["issued with no action", { success: true, hostname }],
	])("refuses a token that is %s", async (_, body) => {
		answer(body);

		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(false);
	});

	it("accepts Cloudflare's test keys, which carry no action and a placeholder host", async () => {
		answer({
			success: true,
			hostname: "example.com",
			metadata: { result_with_testing_key: true },
		});

		await expect(verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", "subscribe")).resolves.toBe(true);
	});

	it("still refuses a failed token from Cloudflare's test keys", async () => {
		answer({
			success: false,
			"error-codes": ["invalid-input-response"],
			metadata: { result_with_testing_key: true },
		});

		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(false);
	});

	it("refuses when Cloudflare cannot be reached", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new DOMException("timed out", "TimeoutError");
			}),
		);

		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(false);
	});

	it.each([
		["is not JSON", "<html>Bad gateway</html>"],
		["has an unexpected shape", '{"success":"yes"}'],
	])("refuses when the answer %s", async (_, text) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(text, { status: 502 })),
		);

		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(false);
	});
});
