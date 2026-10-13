import http from "node:http";
import net from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sendWebhook } from "./webhook";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

/** A port nothing listens on, from closing a server just bound to it. */
function closedPort(): Promise<number> {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as net.AddressInfo;
			server.close(() => resolve(port));
		});
	});
}

describe("sendWebhook delivery", () => {
	it("refuses a private address unless the operator allows it", async () => {
		const port = await closedPort();
		const result = await sendWebhook(
			{ url: `http://127.0.0.1:${port}/hook` },
			{
				type: "monitor_down",
				timestamp: new Date(0),
			},
		);

		expect(result).toEqual({
			success: false,
			errorMessage: "Blocked: 127.0.0.1 is a private address",
		});
	});

	it("reaches a private address once allowed", async () => {
		vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true");

		const port = await closedPort();
		const result = await sendWebhook(
			{ url: `http://127.0.0.1:${port}/hook` },
			{
				type: "monitor_down",
				timestamp: new Date(0),
			},
		);

		expect(result).toEqual({
			success: false,
			errorMessage: `Connection refused by 127.0.0.1:${port}`,
		});
	});

	it("keeps only the start of an error response", async () => {
		vi.stubEnv("UPPITY_ALLOW_PRIVATE_TARGETS", "true");

		const server = http.createServer((_req, res) => {
			res.writeHead(500);
			res.end("x".repeat(1024 * 1024));
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as net.AddressInfo;

		try {
			const result = await sendWebhook(
				{ url: `http://127.0.0.1:${port}/hook` },
				{ type: "monitor_down", timestamp: new Date(0) },
			);

			expect(result).toEqual({
				success: false,
				errorMessage: `Webhook error: 500 - ${"x".repeat(512)}`,
			});
		} finally {
			server.closeAllConnections();
			server.close();
		}
	});
});

describe("sendWebhook body template", () => {
	it("fills known placeholders and leaves unknown ones as written", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
		vi.stubGlobal("fetch", fetchMock);

		const result = await sendWebhook(
			{
				url: "https://example.test/hook",
				bodyTemplate: JSON.stringify({
					text: "{{type}} {{errorMessage}} {{nope}}",
					tags: ["{{type}}"],
				}),
			},
			{ type: "monitor_down", timestamp: new Date(0) },
		);

		expect(result).toEqual({ success: true });
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body).toEqual({ text: "monitor_down  {{nope}}", tags: ["monitor_down"] });
	});
});
