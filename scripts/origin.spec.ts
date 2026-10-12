import { execFile } from "node:child_process";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

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
