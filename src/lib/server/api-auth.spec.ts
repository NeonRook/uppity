import { describe, expect, it, vi } from "vitest";

import { API_KEYS_PER_ORGANIZATION, API_REQUESTS_PER_MINUTE } from "#lib/constants/api.js";
import { DEDICATED_PLAN, FREE_PLAN, UPPITY_PLAN } from "#lib/constants/plans.js";
import type { PlanLimits } from "#lib/types/plans.js";

import {
	authenticateApiRequest,
	isApiRoute,
	refuseApiKeyCreate,
	type ApiAuthDeps,
	type VerifiedKey,
} from "./api-auth";

const KEY = { id: "key-1", referenceId: "org-1", rateLimitMax: 60, rateLimitTimeWindow: 60_000 };

function deps(verified: VerifiedKey, limits: PlanLimits = FREE_PLAN.limits) {
	return {
		verify: vi.fn<ApiAuthDeps["verify"]>(async () => verified),
		limits: vi.fn<ApiAuthDeps["limits"]>(async () => limits),
		setRateLimit: vi.fn<ApiAuthDeps["setRateLimit"]>(async () => undefined),
	};
}

const valid = (key: Partial<NonNullable<VerifiedKey["key"]>> = {}): VerifiedKey => ({
	valid: true,
	error: null,
	key: { ...KEY, ...key },
});

function request(method = "GET", authorization: string | null = "Bearer upt_secret") {
	const headers = authorization === null ? undefined : { authorization };
	return new Request("http://localhost/api/v1/monitors", { method, headers });
}

describe("authenticateApiRequest", () => {
	it("resolves a valid key to its organization", async () => {
		const d = deps(valid());
		expect(await authenticateApiRequest(request(), d)).toEqual({
			organizationId: "org-1",
			keyId: "key-1",
			access: "read",
		});
		expect(d.verify).toHaveBeenCalledWith("upt_secret");
	});

	it("asks for a bearer token when none is sent", async () => {
		for (const header of [null, "upt_secret", "Basic dXNlcjpwYXNz", "Bearer "]) {
			const d = deps(valid());
			const response = await authenticateApiRequest(request("GET", header), d);
			expect(response).toBeInstanceOf(Response);
			expect((response as Response).status).toBe(401);
			expect((response as Response).headers.get("www-authenticate")).toBe("Bearer");
			expect(d.verify).not.toHaveBeenCalled();
		}
	});

	it("refuses a key the plugin rejects", async () => {
		const d = deps({ valid: false, error: { code: "KEY_NOT_FOUND" }, key: null });
		const response = (await authenticateApiRequest(request(), d)) as Response;
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: { code: "unauthorized", message: expect.any(String) },
		});
		expect(d.limits).not.toHaveBeenCalled();
	});

	it("turns the plugin's rate limit into a 429 with Retry-After in seconds", async () => {
		const d = deps({
			valid: false,
			error: { code: "RATE_LIMITED", details: { tryAgainIn: 12_300 } },
			key: null,
		});
		const response = (await authenticateApiRequest(request(), d)) as Response;
		expect(response.status).toBe(429);
		expect(response.headers.get("retry-after")).toBe("13");
	});

	it("lets a read-only plan read but not write", async () => {
		expect(await authenticateApiRequest(request("HEAD"), deps(valid()))).not.toBeInstanceOf(
			Response,
		);
		for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
			const response = (await authenticateApiRequest(request(method), deps(valid()))) as Response;
			expect(response.status).toBe(403);
		}
	});

	it("lets a full-access plan write", async () => {
		const d = deps(valid({ rateLimitMax: 600 }), UPPITY_PLAN.limits);
		expect(await authenticateApiRequest(request("POST"), d)).toMatchObject({ access: "full" });
	});

	it("refuses every request on a plan without API access", async () => {
		const limits: PlanLimits = { ...FREE_PLAN.limits, apiAccess: "none" };
		const response = (await authenticateApiRequest(request(), deps(valid(), limits))) as Response;
		expect(response.status).toBe(403);
	});

	it("leaves a key alone when its limit matches the plan", async () => {
		const d = deps(valid());
		await authenticateApiRequest(request(), d);
		expect(d.setRateLimit).not.toHaveBeenCalled();
	});

	it("moves a key to the plan's limit after a plan change", async () => {
		const d = deps(valid({ rateLimitMax: 60 }), UPPITY_PLAN.limits);
		await authenticateApiRequest(request(), d);
		expect(d.setRateLimit).toHaveBeenCalledWith("key-1", 600, 60_000);
	});

	it("resolves an unlimited plan figure to the operator's limit", async () => {
		const d = deps(valid(), DEDICATED_PLAN.limits);
		await authenticateApiRequest(request(), d);
		expect(d.setRateLimit).toHaveBeenCalledWith("key-1", API_REQUESTS_PER_MINUTE, 60_000);
	});

	it("still corrects the limit when the request is then refused", async () => {
		const d = deps(valid({ rateLimitMax: 600 }));
		await authenticateApiRequest(request("POST"), d);
		expect(d.setRateLimit).toHaveBeenCalledWith("key-1", 60, 60_000);
	});
});

const countKeys = (n: number) => vi.fn(async () => n);

describe("isApiRoute", () => {
	it("matches the API's routes and nothing else", () => {
		expect(isApiRoute("/api/v1")).toBe(true);
		expect(isApiRoute("/api/v1/monitors/[id]")).toBe(true);
		expect(isApiRoute("/api/v10")).toBe(false);
		expect(isApiRoute("/api/health")).toBe(false);
		expect(isApiRoute(null)).toBe(false);
	});
});

describe("refuseApiKeyCreate", () => {
	it("allows a key below the cap", async () => {
		expect(
			await refuseApiKeyCreate(
				{ organizationId: "org-1" },
				countKeys(API_KEYS_PER_ORGANIZATION - 1),
			),
		).toBeNull();
	});

	it("refuses a key at the cap", async () => {
		expect(
			await refuseApiKeyCreate({ organizationId: "org-1" }, countKeys(API_KEYS_PER_ORGANIZATION)),
		).toMatch(/Revoke one/);
	});

	it("leaves a request without an organization to the plugin", async () => {
		const count = countKeys(99);
		expect(await refuseApiKeyCreate({ name: "ci" }, count)).toBeNull();
		expect(await refuseApiKeyCreate(undefined, count)).toBeNull();
		expect(count).not.toHaveBeenCalled();
	});

	it("refuses an organization the plugin would coerce past the count", async () => {
		const count = countKeys(0);
		for (const organizationId of [["org-1"], 123, null, { toString: () => "org-1" }, ""]) {
			expect(await refuseApiKeyCreate({ organizationId }, count)).toMatch(/must be a string/);
		}
		expect(count).not.toHaveBeenCalled();
	});
});
