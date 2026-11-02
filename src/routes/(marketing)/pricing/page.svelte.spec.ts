import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";

import { m } from "#lib/paraglide/messages.js";

import Page from "./+page.svelte";

describe("/pricing/+page.svelte", () => {
	it("lists only the free and self-hosted plans", async () => {
		// The table only shows from sm up; below it the same plans stack as cards.
		await page.viewport(1280, 800);
		await render(Page);

		const table = page.getByRole("table");
		const columns = table.getByRole("columnheader");
		await expect
			.element(columns.nth(1).getByText(m.landing_plan_free(), { exact: true }))
			.toBeVisible();
		await expect
			.element(columns.nth(2).getByText(m.landing_plan_selfhosted(), { exact: true }))
			.toBeVisible();
		expect(columns.elements()).toHaveLength(3);
	});
});
