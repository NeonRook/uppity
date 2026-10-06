import { afterEach, describe, expect, it, vi } from "vitest";

import { sendWebhook } from "./webhook";

afterEach(() => vi.unstubAllGlobals());

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
