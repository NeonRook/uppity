import { afterEach, describe, expect, it, vi } from "vitest";

import { TURNSTILE_TOKEN_HEADER } from "#lib/constants/turnstile.js";

import { appUrl } from "./account-email";
import { auth } from "./auth";

const post = (path: string, body: object, headers: Record<string, string> = {}) =>
	auth.handler(
		new Request(`${appUrl}/api/auth${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: appUrl, ...headers },
			body: JSON.stringify(body),
		}),
	);

const endpoints = [
	["/sign-up/email", "signup", { email: "bot@example.com", password: "long-enough", name: "Bot" }],
	["/request-password-reset", "password-reset", { email: "bot@example.com" }],
] as const;

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe.each(endpoints)("%s with Turnstile keys", (path, action, body) => {
	const { hostname } = new URL(appUrl);

	it.each([
		["no token", {}, { success: false }],
		["a refused token", { [TURNSTILE_TOKEN_HEADER]: "token" }, { success: false }],
		[
			"a token from another form",
			{ [TURNSTILE_TOKEN_HEADER]: "token" },
			{ success: true, action: `not-${action}`, hostname },
		],
	])("refuses %s before doing anything", async (_, headers, answer) => {
		vi.stubEnv("TURNSTILE_SITE_KEY", "site");
		vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json(answer)),
		);

		const response = await post(path, body, headers);

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			message: expect.stringContaining("JavaScript"),
		});
	});
});
