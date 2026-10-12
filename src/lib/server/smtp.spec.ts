import { type AddressInfo, createServer } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string>) {
	vi.resetModules();
	for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
	return import("./smtp");
}

async function loadTransport(env: Record<string, string>) {
	const { smtpTransport } = await load(env);
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

describe("subscriberTransport", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("shares the main server and sender when unset", async () => {
		const smtp = await load({
			SMTP_HOST: "smtp.example.com",
			SMTP_PORT: "587",
			SMTP_FROM: "alerts@example.com",
			SUBSCRIBER_SMTP_HOST: "",
			SUBSCRIBER_SMTP_PORT: "",
			SUBSCRIBER_SMTP_FROM: "",
		});
		expect(smtp.subscriberTransport).toBe(smtp.smtpTransport);
		expect(smtp.subscriberFrom).toBe("alerts@example.com");
	});

	it("uses its own server and sender when set", async () => {
		const smtp = await load({
			SMTP_HOST: "smtp.example.com",
			SMTP_PORT: "587",
			SMTP_FROM: "alerts@example.com",
			SUBSCRIBER_SMTP_HOST: "subscribers.example.com",
			SUBSCRIBER_SMTP_PORT: "465",
			SUBSCRIBER_SMTP_USER: "subscribers",
			SUBSCRIBER_SMTP_PASSWORD: "secret",
			SUBSCRIBER_SMTP_FROM: "status@status.example.com",
		});
		expect(smtp.subscriberTransport?.options).toMatchObject({
			host: "subscribers.example.com",
			port: 465,
			secure: true,
			auth: { user: "subscribers", pass: "secret" },
		});
		expect(smtp.smtpTransport?.options).toMatchObject({ host: "smtp.example.com" });
		expect(smtp.subscriberFrom).toBe("status@status.example.com");
	});
});
