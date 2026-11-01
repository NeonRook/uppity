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
	vi.restoreAllMocks();
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
	])("refuses with %s alone, so a half-set instance is not left open", async (name, value) => {
		vi.stubEnv(name, value);
		const verify = answer(accepted);

		expect(turnstileSiteKey()).toBeUndefined();
		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(false);
		expect(verify).not.toHaveBeenCalled();
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

	it("takes nothing in the answer as a reason to skip the action and host checks", async () => {
		answer({
			success: true,
			hostname: "example.com",
			metadata: { result_with_testing_key: true },
		});

		await expect(verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", "subscribe")).resolves.toBe(false);
	});

	it("accepts a token from the page's own verified domain", async () => {
		answer({ ...accepted, hostname: "status.acme.com" });

		await expect(verifyTurnstile("token", "subscribe", "status.acme.com")).resolves.toBe(true);
	});

	it.each([
		["no verified domain", null],
		["another page's verified domain", "status.other.com"],
	])("refuses a custom domain's token with %s", async (_, verified) => {
		answer({ ...accepted, hostname: "status.acme.com" });

		await expect(verifyTurnstile("token", "subscribe", verified)).resolves.toBe(false);
	});

	it("aborts a call Cloudflare never answers", async () => {
		vi.spyOn(AbortSignal, "timeout").mockImplementationOnce(() => AbortSignal.abort());
		const hang = vi.fn(
			(_url: string, { signal }: RequestInit) =>
				new Promise<Response>((_, reject) => {
					signal?.throwIfAborted();
					signal?.addEventListener("abort", () => reject(signal.reason as Error));
				}),
		);
		vi.stubGlobal("fetch", hang);

		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(false);
		expect(AbortSignal.timeout).toHaveBeenCalledWith(5_000);
	});

	it("holds a bounded number of calls open, then refuses without another", async () => {
		const answers: ((response: Response) => void)[] = [];
		const hang = vi.fn(() => new Promise<Response>((resolve) => answers.push(resolve)));
		vi.stubGlobal("fetch", hang);

		const held = Array.from({ length: 256 }, () => verifyTurnstile("token", "subscribe"));
		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(false);
		expect(hang).toHaveBeenCalledTimes(256);

		for (const respond of answers) respond(Response.json(accepted));
		await Promise.all(held);
		answer(accepted);
		await expect(verifyTurnstile("token", "subscribe")).resolves.toBe(true);
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
