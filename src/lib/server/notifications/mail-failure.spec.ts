import net from "node:net";

import { createTransport } from "nodemailer";
import { afterEach, describe, expect, test } from "vitest";

import { isMailServerDown, isTransientMailFailure } from "./email";

type Replies = Partial<Record<"AUTH" | "MAIL" | "RCPT", string>> & { silent?: boolean };

const servers: net.Server[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

/** Speaks just enough SMTP to fail at the step the test names. */
async function smtpServer({ silent, ...replies }: Replies): Promise<number> {
	const server = net.createServer((socket) => {
		socket.on("error", () => {});
		if (silent) return;
		socket.write("220 fake\r\n");
		socket.on("data", (data) => {
			const verb = data.toString().slice(0, 4).trim().toUpperCase();
			if (verb === "EHLO") socket.write("250-fake\r\n250 AUTH PLAIN\r\n");
			else socket.write(`${replies[verb as keyof typeof replies] ?? "250 ok"}\r\n`);
		});
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return (server.address() as net.AddressInfo).port;
}

async function failureOf(port: number, to = "a@example.com"): Promise<unknown> {
	const transport = createTransport({
		host: "127.0.0.1",
		port,
		auth: { user: "user", pass: "pass" },
		ignoreTLS: true,
		socketTimeout: 100,
		connectionTimeout: 100,
		greetingTimeout: 100,
	});
	return transport.sendMail({ from: "alerts@example.com", to, text: "x" }).catch((e: unknown) => e);
}

// Runs real nodemailer, since these rest on the code, command and reply it reports.
describe("a mail failure", () => {
	test.each<[string, Replies, { transient: boolean; down: boolean }]>([
		["a refused login", { AUTH: "535 bad password" }, { transient: true, down: true }],
		["a throttled login", { AUTH: "454 try later" }, { transient: true, down: true }],
		["a refused sender", { AUTH: "235 ok", MAIL: "550 no" }, { transient: true, down: true }],
		["a server gone quiet", { silent: true }, { transient: true, down: true }],
		["a rejected recipient", { AUTH: "235 ok", RCPT: "550 no" }, { transient: false, down: false }],
		["a deferred recipient", { AUTH: "235 ok", RCPT: "451 no" }, { transient: true, down: false }],
	])("%s", async (_name, replies, { transient, down }) => {
		const error = await failureOf(await smtpServer(replies));

		expect(error).toBeInstanceOf(Error);
		expect(isTransientMailFailure(error)).toBe(transient);
		expect(isMailServerDown(error)).toBe(down);
	});

	test("a refused connection", async () => {
		const server = await smtpServer({});
		for (const open of servers.splice(0)) open.close();

		const error = await failureOf(server);

		expect(isTransientMailFailure(error)).toBe(true);
		expect(isMailServerDown(error)).toBe(true);
	});

	test("a message nodemailer will not send stops at that message", () => {
		const error = Object.assign(new Error("No recipients defined"), {
			code: "EENVELOPE",
			command: "API",
		});

		expect(isTransientMailFailure(error)).toBe(false);
		expect(isMailServerDown(error)).toBe(false);
	});

	test("no SMTP code is not a mail server fault", () => {
		expect(isTransientMailFailure(new Error("SMTP not configured"))).toBe(false);
	});
});
