import { afterEach, describe, expect, it, vi } from "vitest";

import { TURNSTILE_TOKEN_HEADER } from "#lib/constants/turnstile.js";

import { appUrl } from "./account-email";
import { auth } from "./auth";

const signUp = (headers: Record<string, string> = {}) =>
	auth.handler(
		new Request(`${appUrl}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: appUrl, ...headers },
			body: JSON.stringify({ email: "bot@example.com", password: "long-enough", name: "Bot" }),
		}),
	);

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("sign-up with Turnstile keys", () => {
	it.each([
		["no token", {}],
		["a refused token", { [TURNSTILE_TOKEN_HEADER]: "token" }],
	])("refuses %s before creating an account", async (_, headers) => {
		vi.stubEnv("TURNSTILE_SITE_KEY", "site");
		vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ success: false })),
		);

		const response = await signUp(headers);

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			message: expect.stringContaining("JavaScript"),
		});
	});
});
