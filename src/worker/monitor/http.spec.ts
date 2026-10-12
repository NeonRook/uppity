import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createTlsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test, vi } from "vitest";

import { performHttpCheck, type HttpTarget } from "./http";

// Only 127.0.0.2 counts as private here, so a loopback server can stand in for a
// public one while a redirect to 127.0.0.2 meets the guard.
vi.mock("../../lib/server/private-address", () => ({
	isPrivateAddress: (address: string) => address === "127.0.0.2",
	privateTargetsAllowed: () => false,
}));

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../lib/server/test/fixtures");
const tlsOptions = {
	key: readFileSync(join(fixtures, "self-signed-key.pem")),
	cert: readFileSync(join(fixtures, "self-signed-cert.pem")),
};

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const servers: Array<ReturnType<typeof createServer>> = [];

async function serve(handler: Handler, options: { https?: boolean; host?: string } = {}) {
	const server = options.https ? createTlsServer(tlsOptions, handler) : createServer(handler);
	servers.push(server);
	const host = options.host ?? "127.0.0.1";
	await new Promise<void>((resolve) => server.listen(0, host, resolve));
	const { port } = server.address() as AddressInfo;
	return { server, origin: `${options.https ? "https" : "http"}://${host}:${port}` };
}

afterEach(async () => {
	await Promise.all(
		servers.splice(0).map(
			(server) =>
				new Promise<void>((resolve) => {
					server.closeAllConnections();
					server.close(() => resolve());
				}),
		),
	);
});

function target(url: string, overrides: Partial<HttpTarget> = {}): HttpTarget {
	return {
		url,
		method: "GET",
		headers: null,
		body: null,
		timeoutSeconds: 5,
		expectedStatusCodes: [200],
		expectedBodyContains: null,
		followRedirects: true,
		acceptSelfSigned: false,
		sslCheckEnabled: false,
		...overrides,
	};
}

describe("performHttpCheck", () => {
	test("times each phase, with first byte measured from the request being sent", async () => {
		const { origin } = await serve((_req, res) => {
			setTimeout(() => res.end("ok"), 200);
		});
		const url = origin.replace("127.0.0.1", "localhost");

		const result = await performHttpCheck(target(url));

		expect(result).toMatchObject({ status: "up", statusCode: 200, redirectCount: 0 });
		expect(result.tlsMs).toBeUndefined();
		for (const ms of [result.dnsMs, result.connectMs, result.firstByteMs]) {
			expect(Number.isInteger(ms)).toBe(true);
		}
		expect(result.firstByteMs).toBeGreaterThanOrEqual(195);
		expect(result.firstByteMs).toBeLessThan(400);
		const phases = result.dnsMs! + result.connectMs! + result.firstByteMs!;
		expect(result.responseTimeMs - phases).toBeLessThan(25);
	});

	test("skips DNS for an IP address", async () => {
		const { origin } = await serve((_req, res) => res.end());

		const result = await performHttpCheck(target(origin));

		expect(result.dnsMs).toBeUndefined();
		expect(result.connectMs).toBeGreaterThanOrEqual(0);
	});

	test("reads the certificate from the checked connection", async () => {
		const { origin } = await serve((_req, res) => res.end(), { https: true });
		const url = origin.replace("127.0.0.1", "localhost");

		const result = await performHttpCheck(
			target(url, { acceptSelfSigned: true, sslCheckEnabled: true }),
		);

		expect(result).toMatchObject({ status: "up", sslIssuer: "Uppity Test CA" });
		expect(result.sslExpiresAt!.getTime()).toBeGreaterThan(Date.now());
		expect(result.tlsMs).toBeGreaterThan(0);
	});

	test("fails a self-signed certificate the monitor does not accept", async () => {
		const { origin } = await serve((_req, res) => res.end(), { https: true });
		const url = origin.replace("127.0.0.1", "localhost");

		const result = await performHttpCheck(target(url));

		expect(result).toMatchObject({
			status: "down",
			errorMessage: "TLS certificate is self-signed and not trusted",
		});
	});

	test("follows redirects, counting the hops and summing their phases", async () => {
		const { origin } = await serve((req, res) => {
			if (req.url === "/final") res.end("ok");
			else res.writeHead(302, { location: req.url === "/" ? "/next" : "/final" }).end();
		});

		const result = await performHttpCheck(target(`${origin}/`));

		expect(result).toMatchObject({ status: "up", statusCode: 200, redirectCount: 2 });
	});

	test("reports the redirect itself when the monitor does not follow", async () => {
		const { origin } = await serve((_req, res) => {
			res.writeHead(301, { location: "/elsewhere" }).end();
		});

		const result = await performHttpCheck(target(origin, { followRedirects: false }));

		expect(result).toMatchObject({
			status: "down",
			statusCode: 301,
			errorMessage: "Unexpected status code: 301",
			redirectCount: 0,
		});
	});

	test("refuses a redirect to a private address", async () => {
		let reached = false;
		const hidden = await serve(
			(_req, res) => {
				reached = true;
				res.end();
			},
			{ host: "127.0.0.2" },
		);
		const { origin } = await serve((_req, res) => {
			res.writeHead(302, { location: `${hidden.origin}/` }).end();
		});

		const result = await performHttpCheck(target(origin));

		expect(result).toMatchObject({
			status: "down",
			errorMessage: "Blocked: 127.0.0.2 is a private address",
			redirectCount: 1,
		});
		expect(reached).toBe(false);
	});

	test("turns a POST into a GET on 303, and drops credentials across origins", async () => {
		const seen: Array<{ method?: string; authorization?: string }> = [];
		const other = await serve((req, res) => {
			seen.push({ method: req.method, authorization: req.headers.authorization });
			res.end();
		});
		const { origin } = await serve((req, res) => {
			seen.push({ method: req.method, authorization: req.headers.authorization });
			res.writeHead(303, { location: `${other.origin.replace("127.0.0.1", "localhost")}/` }).end();
		});

		await performHttpCheck(
			target(origin, { method: "POST", body: "{}", headers: { Authorization: "Bearer x" } }),
		);

		expect(seen).toEqual([
			{ method: "POST", authorization: "Bearer x" },
			{ method: "GET", authorization: undefined },
		]);
	});

	test("matches body text within the first MiB and no further", async () => {
		const filler = "x".repeat(1024 * 1024);
		const { origin } = await serve((req, res) => {
			res.end(req.url === "/early" ? `needle${filler}` : `${filler}needle`);
		});

		const early = await performHttpCheck(
			target(`${origin}/early`, { expectedBodyContains: "needle" }),
		);
		const late = await performHttpCheck(
			target(`${origin}/late`, { expectedBodyContains: "needle" }),
		);

		expect(early.status).toBe("up");
		expect(late).toMatchObject({ status: "down", errorMessage: "Expected body content not found" });
	});

	test("names the phase a timeout cut short", async () => {
		const { origin } = await serve(() => {});

		const result = await performHttpCheck(target(origin, { timeoutSeconds: 1 }));

		expect(result).toMatchObject({
			status: "down",
			errorMessage: "Timed out after 1s waiting for the response",
		});
	});

	test("names a refused connection", async () => {
		const { origin, server } = await serve(() => {});
		await new Promise<void>((resolve) => server.close(() => resolve()));
		servers.splice(servers.indexOf(server), 1);

		const result = await performHttpCheck(target(origin));

		expect(result).toMatchObject({
			status: "down",
			errorMessage: `Connection refused by ${new URL(origin).host}`,
		});
	});
});
