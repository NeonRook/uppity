import type { RequestEvent } from "@sveltejs/kit";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadClientAddress(header: string) {
	vi.resetModules();
	vi.stubEnv("CLIENT_IP_HEADER", header);
	return (await import("./client-ip")).clientAddress;
}

function requestEvent(headers: Record<string, string>, peer: () => string): RequestEvent {
	return {
		request: new Request("http://localhost/", { headers }),
		getClientAddress: peer,
	} as RequestEvent;
}

const PROXY_PEER = () => "100.64.0.2";

describe("clientAddress", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("reads the configured header instead of the proxy's address", async () => {
		const clientAddress = await loadClientAddress("X-Real-IP");
		const event = requestEvent(
			{ "x-real-ip": "203.0.113.7", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
			PROXY_PEER,
		);
		expect(clientAddress(event)).toBe("203.0.113.7");
	});

	it("does not fall back to the proxy's address when the header is missing", async () => {
		const clientAddress = await loadClientAddress("x-real-ip");
		expect(clientAddress(requestEvent({}, PROXY_PEER))).toBeNull();
	});

	it("uses the socket peer when no header is configured", async () => {
		const clientAddress = await loadClientAddress("");
		expect(clientAddress(requestEvent({ "x-real-ip": "203.0.113.7" }, PROXY_PEER))).toBe(
			"100.64.0.2",
		);
	});

	it("returns null when the adapter cannot determine the peer", async () => {
		const clientAddress = await loadClientAddress("");
		const event = requestEvent({}, () => {
			throw new Error("unavailable");
		});
		expect(clientAddress(event)).toBeNull();
	});
});
