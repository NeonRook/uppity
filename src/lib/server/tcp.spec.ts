import { readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { probeTcp, probeTls } from "./tcp";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "test/fixtures");
const key = readFileSync(join(fixtures, "self-signed-key.pem"));
const cert = readFileSync(join(fixtures, "self-signed-cert.pem"));

const servers: Array<net.Server | tls.Server> = [];
const accepted: net.Socket[] = [];

function listen(server: net.Server | tls.Server): Promise<number> {
	servers.push(server);
	// tls.Server emits "connection" for the raw stream before the handshake, so
	// this catches sockets left behind by a probe that timed out mid-handshake.
	server.on("connection", (socket: net.Socket) => accepted.push(socket));
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			resolve((server.address() as net.AddressInfo).port);
		});
	});
}

/** A port nothing is listening on, obtained by closing a server we just bound. */
function closedPort(): Promise<number> {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});
}

afterEach(async () => {
	// close() alone waits for accepted sockets to end, so drop them first.
	for (const socket of accepted.splice(0)) socket.destroy();
	await Promise.all(
		servers.splice(0).map(
			(server) =>
				new Promise<void>((resolve) => {
					server.close(() => resolve());
				}),
		),
	);
});

describe("probeTcp", () => {
	test("reports ok against a listening port", async () => {
		const port = await listen(net.createServer());

		await expect(probeTcp("127.0.0.1", port, 2000)).resolves.toEqual({ ok: true });
	});

	test("reports the connection error against a closed port", async () => {
		const result = await probeTcp("127.0.0.1", await closedPort(), 2000);

		expect(result).toMatchObject({ ok: false, timedOut: false });
		expect(result).toHaveProperty("error", expect.stringContaining("ECONNREFUSED"));
	});
});

describe("probeTls", () => {
	test("returns the peer certificate", async () => {
		const port = await listen(tls.createServer({ key, cert }));

		const result = await probeTls("localhost", port, 2000);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error("unreachable");
		expect(result.cert?.issuer?.O).toBe("Uppity Test CA");
		expect(Date.parse(result.cert!.valid_to)).toBeGreaterThan(Date.now());
	});

	test("accepts a self-signed certificate rather than refusing to look at it", async () => {
		const port = await listen(tls.createServer({ key, cert }));

		// A validating client refuses this chain, which is the behaviour that would
		// make expiry reporting impossible.
		const validating = await new Promise<string>((resolve) => {
			const socket = tls.connect({ host: "localhost", port, servername: "localhost" });
			socket.once("error", (err: Error) => {
				socket.destroy();
				resolve(err.message);
			});
			socket.once("secureConnect", () => {
				socket.destroy();
				resolve("connected");
			});
		});

		expect(validating).not.toBe("connected");
		await expect(probeTls("localhost", port, 2000)).resolves.toMatchObject({ ok: true });
	});

	// Covers the shared deadline in runProbe. A plain TCP server completes the
	// connection and then never negotiates TLS, so secureConnect cannot fire and
	// only the timer can settle the probe.
	test("times out when the handshake never completes", async () => {
		const port = await listen(net.createServer());

		const started = Date.now();
		const result = await probeTls("localhost", port, 150);

		expect(result).toEqual({ ok: false, error: "Connection timed out", timedOut: true });
		expect(Date.now() - started).toBeLessThan(2000);
	});
});
