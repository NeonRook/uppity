import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";

import MonitorChannelPicker from "./monitor-channel-picker.svelte";

vi.mock("#lib/schemas/monitor.js", () => ({ defaultChannelLink: vi.fn() }));

const channel = {
	id: "a",
	name: "Ops",
	type: "email",
	enabled: true,
	confirmed: false,
	unsubscribed: false,
	destination: "ops@example.com",
};

describe("monitor-channel-picker.svelte", () => {
	it("marks a channel still waiting on its recipient as unconfirmed", async () => {
		await render(MonitorChannelPicker, { channels: [channel], selected: [], showSslExpiry: false });

		await expect.element(page.getByText("Unconfirmed")).toBeInTheDocument();
	});

	it("marks a channel whose recipient opted out as unsubscribed", async () => {
		await render(MonitorChannelPicker, {
			channels: [{ ...channel, unsubscribed: true }],
			selected: [],
			showSslExpiry: false,
		});

		await expect.element(page.getByText("Unsubscribed")).toBeInTheDocument();
		await expect.element(page.getByText("Unconfirmed")).not.toBeInTheDocument();
	});
});
