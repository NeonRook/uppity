import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REWRITTEN_ORIGIN_HEADER } from "#lib/status-page.js";

import { appUrl } from "./account-email";
import { handleStatusHost } from "./status-host";

const { findByDomain, hasCustomDomain } = vi.hoisted(() => ({
	findByDomain: vi.fn(),
	hasCustomDomain: vi.fn(),
}));

vi.mock("#lib/server/services/status-page.service.js", () => ({
	statusPageService: { findByDomain, hasCustomDomain },
}));

const PAGE_ROUTE = "/(public)/status/[slug]";
const INCIDENT_ROUTE = "/(public)/status/[slug]/incidents/[incidentId]";

interface Visit {
	path?: string;
	routeId?: string | null;
	slug?: string;
	cookie?: string;
	headers?: Record<string, string>;
	isRemoteRequest?: boolean;
}

async function visit(
	host: string,
	{ path = "/", routeId = null, slug, cookie, headers, isRemoteRequest = false }: Visit = {},
) {
	const resolve = vi.fn(async () => {
		const response = new Response("rendered");
		if (cookie) response.headers.append("set-cookie", cookie);
		return response;
	});
	const event = {
		url: new URL(`https://${host}${path}`),
		request: new Request(`https://${host}${path}`, { headers }),
		route: { id: routeId },
		params: slug ? { slug } : {},
		locals: {} as App.Locals,
		isRemoteRequest,
	};
	const response = await handleStatusHost({ event, resolve } as never);
	return { response, resolve, locals: event.locals };
}

beforeEach(() => {
	findByDomain.mockReset();
	findByDomain.mockImplementation(async (domain: string) => {
		if (domain === "status.acme.com") return { slug: "acme", isPublic: true };
		return domain === "private.acme.com" ? { slug: "hidden", isPublic: false } : null;
	});
	hasCustomDomain.mockReset();
	hasCustomDomain.mockImplementation(async (slug: string) => slug === "acme");
});

describe("on the app's own host", () => {
	it("serves the app without a lookup", async () => {
		const { response, resolve, locals } = await visit(new URL(appUrl).host, { path: "/login" });

		expect(await response.text()).toBe("rendered");
		expect(resolve).toHaveBeenCalledOnce();
		expect(locals.statusHost).toBe(false);
		expect(findByDomain).not.toHaveBeenCalled();
	});

	it("leaves another page's public route alone", async () => {
		const { response } = await visit(new URL(appUrl).host, {
			path: "/status/globex",
			routeId: PAGE_ROUTE,
			slug: "globex",
		});

		expect(response.status).toBe(200);
	});

	it.each(["localhost:3000", "10.0.0.5:3000", "app:3000", "[::1]:3000", "uppity.lan"])(
		"serves the app on %s, which no public DNS name can reach",
		async (host) => {
			const { response } = await visit(host, { path: "/login" });

			expect(response.status).toBe(200);
			expect(findByDomain).not.toHaveBeenCalled();
		},
	);
});

describe("on a host no page has verified", () => {
	it.each([
		["the front page", "/", null],
		["the sign-in page", "/login", "/(auth)/login"],
		["the API", "/api/v1/monitors", "/api/v1/monitors"],
		["a status page without a domain", "/status/globex", PAGE_ROUTE],
	])("serves %s, so a host missing from the config locks nobody out", async (_, path, routeId) => {
		const slug = routeId === PAGE_ROUTE ? "globex" : undefined;
		const { response, resolve, locals } = await visit("uppity.up.railway.app", {
			path,
			routeId,
			slug,
		});

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		expect(locals.statusHost).toBe(false);
	});

	it.each([
		["a page on a verified domain", "/status/acme", PAGE_ROUTE],
		["an incident on it", "/status/acme/incidents/inc", INCIDENT_ROUTE],
	])("refuses %s, so a lookalike domain cannot show it", async (_, path, routeId) => {
		const { response, resolve } = await visit("status-acme.com", { path, routeId, slug: "acme" });

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	});

	it("answers the platform's health probe without a lookup", async () => {
		const { response } = await visit("healthcheck.railway.app", {
			path: "/api/health",
			routeId: "/api/health",
		});

		expect(response.status).toBe(200);
		expect(findByDomain).not.toHaveBeenCalled();
	});
});

describe("a form post whose origin the server rewrote", () => {
	const headers = { [REWRITTEN_ORIGIN_HEADER]: "1" };

	it("reaches the page when its host is the verified domain", async () => {
		const { response } = await visit("status.acme.com", {
			path: "/status/acme",
			routeId: PAGE_ROUTE,
			slug: "acme",
			headers,
		});

		expect(response.status).toBe(200);
	});

	it.each(["evil.com", "uppity.up.railway.app", "10.0.0.5:3000", new URL(appUrl).host])(
		"is refused on %s, so a Host header alone trusts no origin",
		async (host) => {
			const { response, resolve } = await visit(host, {
				path: "/login",
				routeId: "/(auth)/login",
				headers,
			});

			expect(response.status).toBe(403);
			expect(resolve).not.toHaveBeenCalled();
		},
	);
});

describe("with ORIGIN set, where the URL holds the pinned origin", () => {
	beforeEach(() => {
		vi.stubEnv("ORIGIN", "https://uppity.example.com");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("reads the requested host from the Host header", async () => {
		const { response } = await visit("uppity.example.com", {
			headers: { host: "Status.Acme.com." },
		});

		expect(response.status).toBe(307);
	});

	it("takes nothing from X-Forwarded-Host", async () => {
		const { response } = await visit("uppity.example.com", {
			headers: { host: "uppity.example.com", "x-forwarded-host": "status.acme.com" },
		});

		expect(response.status).toBe(200);
	});
});

describe("on a verified domain", () => {
	it.each(["status.acme.com", "STATUS.ACME.COM", "status.acme.com."])(
		"sends %s from the root to its page, whatever the case or trailing dot",
		async (host) => {
			const { response, resolve } = await visit(host);

			expect(response.status).toBe(307);
			expect(response.headers.get("location")).toBe("/status/acme");
			expect(resolve).not.toHaveBeenCalled();
		},
	);

	it.each([
		["its page", "/status/acme", PAGE_ROUTE],
		["an incident on it", "/status/acme/incidents/inc", INCIDENT_ROUTE],
	])("serves %s with no session", async (_, path, routeId) => {
		const { response, locals } = await visit("status.acme.com", { path, routeId, slug: "acme" });

		expect(response.status).toBe(200);
		expect(locals).toMatchObject({
			statusHost: true,
			user: null,
			session: null,
			apiCaller: null,
		});
	});

	it("drops any cookie a response tries to set", async () => {
		const { response } = await visit("status.acme.com", {
			path: "/status/acme",
			routeId: PAGE_ROUTE,
			slug: "acme",
			cookie: "better-auth.session_token=x",
		});

		expect(response.headers.get("set-cookie")).toBeNull();
	});

	it("marks the response as varying by host", async () => {
		const { response } = await visit("status.acme.com", {
			path: "/status/acme",
			routeId: PAGE_ROUTE,
			slug: "acme",
		});

		expect(response.headers.get("vary")).toContain("Host");
	});

	it("refuses a remote function that names the page as its pathname", async () => {
		const { response, resolve } = await visit("status.acme.com", {
			path: "/status/acme",
			routeId: PAGE_ROUTE,
			slug: "acme",
			isRemoteRequest: true,
		});

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	});

	it.each([
		["the root", "/", null],
		["the app's sign-in", "/login", "/(auth)/login"],
	])("serves a private page's domain nothing: %s", async (_, path, routeId) => {
		const { response, resolve } = await visit("private.acme.com", { path, routeId });

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	});

	it("refuses another organization's page", async () => {
		const { response, resolve } = await visit("status.acme.com", {
			path: "/status/globex",
			routeId: PAGE_ROUTE,
			slug: "globex",
		});

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	});

	it.each([
		["sign-in", "/login", "/(auth)/login"],
		["the dashboard", "/dashboard", "/(app)/dashboard"],
		["admin", "/admin", "/(admin)/admin"],
		["the API", "/api/v1/status-pages", "/api/v1/status-pages"],
		["better-auth", "/api/auth/get-session", null],
		["a remote function", "/_app/remote/abc/getStatusPages", null],
		["a push webhook", "/api/webhooks/push/token", "/api/webhooks/push/[token]"],
		[
			"confirmation, which mail links on the app host",
			"/status/confirm/t",
			"/(public)/status/confirm/[token]",
		],
		["unsubscribe", "/status/acme/unsubscribe/t", "/(public)/status/[slug]/unsubscribe/[token]"],
	])("refuses %s", async (_, path, routeId) => {
		const { response, resolve } = await visit("status.acme.com", {
			path,
			routeId,
			slug: "acme",
		});

		expect(response.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	});
});
