import { type AddressInfo, createServer } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadTransport(env: Record<string, string>) {
	vi.resetModules();
	for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
	const { smtpTransport } = await import("./smtp");
	return smtpTransport?.options;
}

describe("smtpTransport", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("refuses to send credentials without TLS", async () => {
		const options = await loadTransport({
			SMTP_HOST: "smtp.example.com",
			SMTP_PORT: "587",
			SMTP_USER: "user",
			SMTP_PASSWORD: "secret",
		});
		expect(options?.requireTLS).toBe(true);
	});

	it("allows an unauthenticated relay without TLS", async () => {
		const options = await loadTransport({
			SMTP_HOST: "localhost",
			SMTP_PORT: "1025",
			SMTP_USER: "",
			SMTP_PASSWORD: "",
		});
		expect(options?.requireTLS).toBe(false);
	});

	it("uses implicit TLS on 465", async () => {
		const options = await loadTransport({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465" });
		expect(options?.secure).toBe(true);
	});

	it("holds an SMTP session over the socket it dials", async () => {
		const server = createServer((socket) => {
			socket.write("220 test ESMTP\r\n");
			socket.on("data", (data) => {
				const command = data.toString().slice(0, 4).toUpperCase();
				socket.write(command === "QUIT" ? "221 bye\r\n" : "250 ok\r\n");
				if (command === "QUIT") socket.end();
			});
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;

		vi.resetModules();
		vi.stubEnv("SMTP_HOST", "localhost");
		vi.stubEnv("SMTP_PORT", String(port));
		vi.stubEnv("SMTP_USER", "");
		vi.stubEnv("SMTP_PASSWORD", "");
		const { smtpTransport } = await import("./smtp");

		await expect(smtpTransport?.verify()).resolves.toBe(true);
		server.close();
	});
});
