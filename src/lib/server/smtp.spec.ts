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
});
