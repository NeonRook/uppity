import { afterEach, describe, expect, it, vi } from "vitest";

import { sendDiscord } from "./discord";
import { sendEmail } from "./email";
import { sendSlack } from "./slack";
import type { NotificationPayload } from "./types";

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("../smtp", () => ({ smtpFrom: "alerts@example.com", smtpTransport: { sendMail } }));

const payload: NotificationPayload = {
	type: "monitor_down",
	timestamp: new Date("2026-10-10T18:34:09.838Z"),
};
const readable = "10 Oct 2026, 18:34 UTC";

/** Stubs fetch and returns a reader for the JSON body of the first request. */
function stubFetch() {
	const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
	vi.stubGlobal("fetch", fetchMock);
	return () => JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe("the time in a notification", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("is readable in email", async () => {
		await sendEmail({ email: "a@example.com", token: "t" }, payload);

		const [[mail]] = sendMail.mock.calls;
		expect(mail.text).toContain(`Time: ${readable}`);
		expect(mail.html).toContain(readable);
	});

	it("is readable in a Discord field and ISO 8601 in the embed timestamp", async () => {
		const body = stubFetch();

		await sendDiscord({ discordWebhookUrl: "https://discord.example/hook" }, payload);

		const [embed] = body().embeds;
		expect(embed.fields).toContainEqual({ name: "Time", value: readable, inline: true });
		expect(embed.timestamp).toBe("2026-10-10T18:34:09.838Z");
	});

	it("is readable in Slack's fallback text", async () => {
		const body = stubFetch();

		await sendSlack({ webhookUrl: "https://slack.example/hook" }, payload);

		expect(JSON.stringify(body())).toContain(`|${readable}>`);
	});
});
