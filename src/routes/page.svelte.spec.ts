import type { FeaturedUptime } from "$lib/server/services/status-page.service";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";

import Page from "./+page.svelte";

/** Ninety consecutive days, so the keyed each block gets unique keys. */
function uptimeDays(status: FeaturedUptime["days"][number]["status"]): FeaturedUptime["days"] {
	return Array.from({ length: 90 }, (_, i) => {
		const date = new Date(Date.UTC(2026, 0, 1));
		date.setUTCDate(date.getUTCDate() + i);
		const [iso] = date.toISOString().split("T");
		return { date: iso, status, uptimePercent: status === "unknown" ? null : 100 };
	});
}

function featured(overrides: Partial<FeaturedUptime> = {}): FeaturedUptime {
	return {
		slug: "uppity",
		name: "Uppity",
		uptimePercent: 99.51,
		days: uptimeDays("up"),
		...overrides,
	};
}

describe("/+page.svelte", () => {
	it("should render h1", async () => {
		await render(Page, { data: { featuredUptime: null } });

		const heading = page.getByRole("heading", { level: 1 });
		await expect.element(heading).toBeInTheDocument();
	});

	it("omits the proof band when no status page is featured", async () => {
		await render(Page, { data: { featuredUptime: null } });

		await expect.element(page.getByText("99.51% uptime")).not.toBeInTheDocument();
	});

	it("shows the measured uptime when a status page is featured", async () => {
		await render(Page, { data: { featuredUptime: featured() } });

		await expect.element(page.getByText("99.51% uptime")).toBeInTheDocument();
	});

	it("says so rather than inventing a figure when nothing has been measured", async () => {
		await render(Page, {
			data: {
				featuredUptime: featured({ uptimePercent: null, days: uptimeDays("unknown") }),
			},
		});

		await expect.element(page.getByText("No data")).toBeInTheDocument();
	});
});
