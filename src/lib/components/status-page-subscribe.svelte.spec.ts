import { superForm } from "sveltekit-superforms";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";

import StatusPageSubscribe from "./status-page-subscribe.svelte";

vi.mock("sveltekit-superforms", { spy: true });

const data = {
	id: "subscribe",
	valid: false,
	posted: false,
	errors: {},
	data: { email: "" },
};

function stubWidget() {
	const widget = { render: vi.fn(() => "widget"), reset: vi.fn(), remove: vi.fn() };
	vi.stubGlobal("turnstile", widget);
	return widget;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("status-page-subscribe.svelte", () => {
	it("contacts Cloudflare only once a visitor starts on the form", async () => {
		const widget = stubWidget();
		await render(StatusPageSubscribe, { data, turnstileSiteKey: "site" });

		expect(widget.render).not.toHaveBeenCalled();

		await page.getByLabelText("Email address").click();

		await vi.waitFor(() => expect(widget.render).toHaveBeenCalledOnce());
		expect(widget.render).toHaveBeenCalledWith(
			expect.any(HTMLElement),
			expect.objectContaining({ sitekey: "site", action: "subscribe" }),
		);
	});

	it("asks the widget for a new token after a submission spends the old one", async () => {
		const widget = stubWidget();
		await render(StatusPageSubscribe, { data, turnstileSiteKey: "site" });
		await page.getByLabelText("Email address").click();
		await vi.waitFor(() => expect(widget.render).toHaveBeenCalledOnce());

		const options = vi.mocked(superForm).mock.lastCall?.[1];
		options?.onResult?.({} as never);

		expect(widget.reset).toHaveBeenCalledWith("widget");
	});

	it("shows no widget without a site key", async () => {
		const widget = stubWidget();
		await render(StatusPageSubscribe, { data });

		await page.getByLabelText("Email address").click();

		await expect.element(page.getByRole("button", { name: "Subscribe" })).toBeEnabled();
		expect(widget.render).not.toHaveBeenCalled();
	});
});
