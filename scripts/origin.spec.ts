import { execFile } from "node:child_process";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { REWRITTEN_ORIGIN_HEADER } from "../src/lib/status-page.ts";
import { parseOrigin, pinOrigin } from "./origin.ts";

/** The origin adapter-node derives from a request, given the header settings in `env`. */
function adapterOrigin(env: NodeJS.ProcessEnv, headers: IncomingHttpHeaders): string {
	const read = (name: string | undefined) => (name ? headers[name.toLowerCase()] : undefined);
	const protocol = read(env.PROTOCOL_HEADER) || "https";
	const host = read(env.HOST_HEADER) || headers.host;
	const port = read(env.PORT_HEADER);
	return port
		? `${String(protocol)}://${String(host)}:${String(port)}`
		: `${String(protocol)}://${String(host)}`;
}

/** A request as the client sent it, after pinOrigin's listener has run. */
function handled(env: NodeJS.ProcessEnv, headers: IncomingHttpHeaders): string {
	const req = { headers: { ...headers } } as IncomingMessage;
	pinOrigin(env)?.(req);
	return adapterOrigin(env, req.headers);
}

describe("pinOrigin", () => {
	it("serves a plain HTTP origin as http", () => {
		const env = { ORIGIN: "http://uppity.lan:3000" };
		expect(handled(env, { host: "10.0.0.5:3000" })).toBe("http://uppity.lan:3000");
	});

	it("ignores forwarding headers a client sends", () => {
		const env = { ORIGIN: "https://status.example.com", PORT_HEADER: "x-forwarded-port" };
		const origin = handled(env, {
			host: "evil.example",
			"x-forwarded-proto": "http",
			"x-forwarded-host": "evil.example",
			"x-forwarded-port": "8443",
			"x-uppity-origin-protocol": "http",
			"x-uppity-origin-host": "evil.example",
		});
		expect(origin).toBe("https://status.example.com");
	});

	it("overrides the proxy headers an operator configured", () => {
		const env = { ORIGIN: "https://status.example.com", HOST_HEADER: "x-forwarded-host" };
		expect(handled(env, { host: "app:3000", "x-forwarded-host": "evil.example" })).toBe(
			"https://status.example.com",
		);
	});

	it("keeps the pin whatever the Host", () => {
		const env = { ORIGIN: "https://uppity.example.com" };
		for (const host of ["status.acme.com", "10.0.0.5:3000", "[::1]:3000", "app:3000"]) {
			expect(handled(env, { host })).toBe("https://uppity.example.com");
		}
	});

	it("takes nothing from X-Forwarded-Host", () => {
		const env = { ORIGIN: "https://uppity.example.com", HOST_HEADER: "x-forwarded-host" };
		expect(handled(env, { host: "app:3000", "x-forwarded-host": "status.acme.com" })).toBe(
			"https://uppity.example.com",
		);
	});

	it("leaves the adapter's header settings alone when unset", () => {
		const env = { PROTOCOL_HEADER: "x-forwarded-proto", HOST_HEADER: "x-forwarded-host" };
		expect(pinOrigin(env)).toBeUndefined();
		expect(env).toEqual({ PROTOCOL_HEADER: "x-forwarded-proto", HOST_HEADER: "x-forwarded-host" });
		expect(
			handled(env, {
				host: "app:3000",
				"x-forwarded-proto": "https",
				"x-forwarded-host": "status.example.com",
			}),
		).toBe("https://status.example.com");
	});
});

describe("the same-origin check on form posts", () => {
	const env = { ORIGIN: "https://uppity.example.com" };

	/** What reaches SvelteKit's check, which compares `Origin` with the pinned origin. */
	function posted(headers: IncomingHttpHeaders) {
		const pinned = { ...env };
		const req = { headers: { ...headers } } as IncomingMessage;
		pinOrigin(pinned)?.(req);
		return {
			passes: req.headers.origin === adapterOrigin(pinned, req.headers),
			marked: REWRITTEN_ORIGIN_HEADER in req.headers,
		};
	}

	it("lets a post from a page on the Host through, marked for the web tier to judge", () => {
		const headers = { host: "status.acme.com", origin: "https://status.acme.com" };
		expect(handled({ ...env }, headers)).toBe("https://uppity.example.com");
		expect(posted(headers)).toEqual({ passes: true, marked: true });
	});

	it("leaves a post from the app's own origin unmarked", () => {
		const headers = { host: "uppity.example.com", origin: "https://uppity.example.com" };
		expect(posted(headers)).toEqual({ passes: true, marked: false });
	});

	it("keeps a proxy that rewrites Host working, as the pin always has", () => {
		const headers = { host: "app:3000", origin: "https://uppity.example.com" };
		expect(posted(headers)).toEqual({ passes: true, marked: false });
	});

	it.each([
		["another site, to the app", "uppity.example.com", "https://evil.example"],
		["another site, to a custom domain", "status.acme.com", "https://evil.example"],
		["a custom domain, to the app", "uppity.example.com", "https://status.acme.com"],
		["plain http, to a custom domain", "status.acme.com", "http://status.acme.com"],
		["no origin at all", "status.acme.com", undefined],
	])("refuses a post from %s", (_, host, origin) => {
		expect(posted({ host, origin })).toEqual({ passes: false, marked: false });
	});

	it("overwrites a mark the client sent", () => {
		const headers = {
			host: "uppity.example.com",
			origin: "https://uppity.example.com",
			[REWRITTEN_ORIGIN_HEADER]: "1",
		};
		expect(posted(headers).marked).toBe(false);
	});
});

describe("parseOrigin", () => {
	it("accepts a trailing slash", () => {
		expect(parseOrigin("https://status.example.com/")?.origin).toBe("https://status.example.com");
	});

	it.each([
		["not a URL", "status.example.com"],
		["a path", "https://example.com/status"],
		["a query", "https://example.com?x=1"],
		["credentials", "https://user:pass@example.com"],
		["another scheme", "ftp://example.com"],
	])("refuses %s", (_, input) => {
		expect(() => parseOrigin(input)).toThrow(/ORIGIN/);
	});
});

describe("serve", () => {
	it("refuses to start on a malformed ORIGIN", async () => {
		const serve = fileURLToPath(new URL("serve.ts", import.meta.url));
		const run = promisify(execFile)(process.execPath, [serve], {
			env: { PATH: process.env.PATH ?? "", ORIGIN: "https://example.com/status" },
		});
		await expect(run).rejects.toMatchObject({
			code: 1,
			stderr: expect.stringContaining("ORIGIN must be a scheme and host only"),
		});
	});
});
