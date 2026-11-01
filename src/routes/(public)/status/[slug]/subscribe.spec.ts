import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appUrl } from "#lib/server/account-email.js";

import { actions } from "./+page.server";

const subscribe = vi.hoisted(() => vi.fn());

vi.mock("#lib/server/services/status-page-subscriber.instance.js", () => ({
	statusPageSubscriberService: { subscribe },
}));
vi.mock("#lib/server/services/status-page.service.js", () => ({
	statusPageService: {
		findBySlug: async () => ({ id: "page", organizationId: "org", isPublic: true }),
	},
}));

let client = 0;

/** A form POST from an address of its own, so the rate limiter stays out of the way. */
function post(fields: Record<string, string>, address = `client-${++client}`) {
	const url = "http://localhost/status/acme?/subscribe";
	const event = {
		params: { slug: "acme" },
		url: new URL(url),
		request: new Request(url, { method: "POST", body: new URLSearchParams(fields) }),
		locals: { event: { merge: vi.fn(), set: vi.fn(), setError: vi.fn() } },
		getClientAddress: () => address,
	};
	return actions.subscribe(event as never) as Promise<{
		status: number;
		data: { form: { message?: string } };
	}>;
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	subscribe.mockReset();
});

describe("without Turnstile keys", () => {
	it("subscribes with no token, so a self-hosted form works with no setup", async () => {
		const verify = vi.fn();
		vi.stubGlobal("fetch", verify);
		subscribe.mockResolvedValue("sent");

		await post({ email: "visitor@example.com" });

		expect(subscribe).toHaveBeenCalledOnce();
		expect(verify).not.toHaveBeenCalled();
	});
});

describe("with Turnstile keys", () => {
	const { hostname } = new URL(appUrl);
	const verified = (success: boolean) =>
		vi.fn(async () => Response.json({ success, action: "subscribe", hostname }));

	beforeEach(() => {
		vi.stubEnv("TURNSTILE_SITE_KEY", "site");
		vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
	});

	it("subscribes once Cloudflare accepts the token", async () => {
		vi.stubGlobal("fetch", verified(true));
		subscribe.mockResolvedValue("sent");

		await post({ email: "visitor@example.com", "cf-turnstile-response": "token" });

		expect(subscribe).toHaveBeenCalledOnce();
	});

	it("explains itself to a browser that sent no token, such as one without JavaScript", async () => {
		vi.stubGlobal("fetch", verified(true));

		const result = await post({ email: "visitor@example.com" });

		expect(result.status).toBe(403);
		expect(result.data.form.message).toContain("JavaScript");
		expect(subscribe).not.toHaveBeenCalled();
	});

	it("refuses before the address is looked at, so the answer cannot reveal suppression", async () => {
		vi.stubGlobal("fetch", verified(false));

		const result = await post({
			email: "suppressed@example.com",
			"cf-turnstile-response": "token",
		});

		expect(result.status).toBe(403);
		expect(subscribe).not.toHaveBeenCalled();
	});

	it("refuses while Cloudflare is unreachable", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

		const result = await post({
			email: "visitor@example.com",
			"cf-turnstile-response": "token",
		});

		expect(result.status).toBe(403);
		expect(subscribe).not.toHaveBeenCalled();
	});

	it("spends no Cloudflare call on a rate limited client", async () => {
		const verify = verified(true);
		vi.stubGlobal("fetch", verify);
		subscribe.mockResolvedValue("sent");
		const fields = { email: "visitor@example.com", "cf-turnstile-response": "token" };

		for (let attempt = 0; attempt < 10; attempt++) await post(fields, "busy");
		verify.mockClear();
		const result = await post(fields, "busy");

		expect(result.status).toBe(429);
		expect(verify).not.toHaveBeenCalled();
	});
});
