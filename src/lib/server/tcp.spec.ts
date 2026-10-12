import { lookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { dial, failureMessage, probeTcp, type Phase } from "./tcp";

vi.mock("node:dns/promises", async (importOriginal) => {
	const real = await importOriginal<typeof import("node:dns/promises")>();
	return { ...real, lookup: vi.fn(real.lookup) };
});

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "test/fixtures");
const fixture = (name: string) => readFileSync(join(fixtures, name));
const key = fixture("self-signed-key.pem");

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

/** Dials TLS to a local server presenting `certFile`, returning the failure message if any. */
async function dialTls(certFile: string, acceptSelfSigned: boolean) {
	const port = await listen(tls.createServer({ key, cert: fixture(certFile) }));
	const signal = AbortSignal.timeout(2000);
	let phase: Phase = "dns";
	try {
		const dialed = await dial({
			host: "localhost",
			port,
			tls: { acceptSelfSigned },
			signal,
			onPhase: (p) => (phase = p),
		});
		dialed.socket.destroy();
		return { dialed };
	} catch (error) {
		return { error: failureMessage(error, signal, phase, 2) };
	}
}

beforeEach(() => vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true"));

afterEach(async () => {
	vi.unstubAllEnvs();
	vi.mocked(lookup).mockClear();
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

	test("names a refused connection", async () => {
		const port = await closedPort();

		await expect(probeTcp("127.0.0.1", port, 2000)).resolves.toEqual({
			ok: false,
			error: `Connection refused by 127.0.0.1:${port}`,
		});
	});

	test("names a host that does not exist", async () => {
		const result = await probeTcp("does-not-exist.invalid", 80, 2000);

		expect(result).toEqual({
			ok: false,
			error: "DNS lookup failed: does-not-exist.invalid does not exist",
		});
	});
});

describe("private addresses", () => {
	beforeEach(() => vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", ""));

	test("refuses a private IP before connecting", async () => {
		let connections = 0;
		const port = await listen(net.createServer(() => connections++));

		await expect(probeTcp("127.0.0.1", port, 2000)).resolves.toEqual({
			ok: false,
			error: "Blocked: 127.0.0.1 is a private address",
		});
		expect(connections).toBe(0);
	});

	test("refuses a host name when any address it resolves to is private", async () => {
		vi.mocked(lookup).mockResolvedValueOnce([
			{ address: "1.1.1.1", family: 4 },
			{ address: "::ffff:10.0.0.1", family: 6 },
		] as never);

		await expect(probeTcp("mixed.example", 80, 2000)).resolves.toEqual({
			ok: false,
			error: "Blocked: mixed.example resolves to a private address",
		});
	});

	test("never names the address a host name resolved to", async () => {
		const ipv4 = /\d+\.\d+\.\d+\.\d+/;
		const ipv6 = /[0-9a-f]*:[0-9a-f]*:/i;
		const messages: string[] = [];
		for (const address of ["10.20.30.40", "fd12:3456::1", "::ffff:192.168.7.7"]) {
			vi.mocked(lookup).mockResolvedValueOnce([
				{ address, family: address.includes(":") ? 6 : 4 },
			] as never);
			const result = await probeTcp("internal.example", 80, 2000);
			if (!result.ok) messages.push(result.error);
		}
		vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true");
		const port = await closedPort();
		vi.mocked(lookup).mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
		const refused = await probeTcp("internal.example", port, 2000);
		if (!refused.ok) messages.push(refused.error);

		expect(messages).toHaveLength(4);
		for (const message of messages) {
			expect(message).not.toMatch(ipv4);
			expect(message).not.toMatch(ipv6);
		}
	});

	test("connects only to the addresses it checked, so a second answer is never used", async () => {
		let connections = 0;
		const port = await listen(net.createServer(() => connections++));
		// A rebinding resolver: public on the first query, loopback on every later one.
		vi.mocked(lookup)
			.mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }] as never)
			.mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);

		const result = await probeTcp("rebind.example", port, 300);

		expect(result.ok).toBe(false);
		expect(lookup).toHaveBeenCalledTimes(1);
		expect(connections).toBe(0);
	});
});

describe("dial over TLS", () => {
	test("reads the certificate and times each phase", async () => {
		const { dialed } = await dialTls("self-signed-cert.pem", true);

		expect(dialed?.cert?.issuer).toBe("Uppity Test CA");
		expect(dialed?.cert?.expiresAt.getTime()).toBeGreaterThan(Date.now());
		expect(dialed?.dnsMs).toBeGreaterThanOrEqual(0);
		expect(dialed?.connectMs).toBeGreaterThanOrEqual(0);
		expect(dialed?.tlsMs).toBeGreaterThan(0);
	});

	test("refuses a self-signed certificate unless the monitor accepts one", async () => {
		await expect(dialTls("self-signed-cert.pem", false)).resolves.toEqual({
			error: "TLS certificate is self-signed and not trusted",
		});
	});

	test("still refuses an accepted self-signed certificate that has expired", async () => {
		await expect(dialTls("expired-cert.pem", true)).resolves.toEqual({
			error: "TLS certificate has expired",
		});
	});

	test("still refuses an accepted self-signed certificate for another host", async () => {
		await expect(dialTls("other-host-cert.pem", true)).resolves.toEqual({
			error: "TLS certificate is not valid for localhost",
		});
	});

	test("does not take a certificate from an unknown issuer as self-signed", async () => {
		await expect(dialTls("untrusted-ca-cert.pem", true)).resolves.toEqual({
			error: "TLS certificate is not trusted: its issuer is unknown",
		});
	});

	// A plain TCP server completes the connection and then never negotiates TLS,
	// so only the deadline can settle the dial.
	test("names the handshake as the phase a timeout cut short", async () => {
		const port = await listen(net.createServer());
		const signal = AbortSignal.timeout(150);
		let phase: Phase = "dns";

		const error = await dial({
			host: "127.0.0.1",
			port,
			tls: { acceptSelfSigned: false },
			signal,
			onPhase: (p) => (phase = p),
		}).catch((e: unknown) => e);

		expect(failureMessage(error, signal, phase, 0.15)).toBe(
			"Timed out after 0.15s in the TLS handshake",
		);
	});
});
