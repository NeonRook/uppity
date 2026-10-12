import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";

import type { ResponseDay } from "#lib/server/services/response-history.service.js";

import ResponseTimeChart from "./response-time-chart.svelte";

/** `count` days ending 2026-10-12, measured unless `override` says otherwise. */
function history(
	count: number,
	override: Record<number, Partial<ResponseDay>> = {},
): ResponseDay[] {
	return Array.from({ length: count }, (_, i) => {
		const date = new Date(Date.UTC(2026, 9, 12 - (count - 1 - i))).toISOString().slice(0, 10);
		return { date, avgMs: 100, p95Ms: 200, status: "up", ...override[i] };
	});
}

const legendItem = (name: string) => page.getByRole("listitem").filter({ hasText: name });

describe("response-time-chart.svelte", () => {
	it("offers each window and keys only the shading the window shows", async () => {
		const days = history(90, {
			10: { status: "down", avgMs: null, p95Ms: null },
			85: { status: "degraded" },
		});
		await render(ResponseTimeChart, { days, windows: [30, 60, 90] });

		await expect
			.element(page.getByRole("button", { name: "30 days" }))
			.toHaveAttribute("aria-pressed", "true");
		await expect.element(legendItem("Degraded")).toBeInTheDocument();
		await expect.element(legendItem("Down")).not.toBeInTheDocument();

		await page.getByRole("button", { name: "90 days" }).click();

		await expect.element(legendItem("Down")).toBeInTheDocument();
	});

	it("reads out the focused day and steps with the arrow keys", async () => {
		const days = history(30, { 28: { avgMs: 140, p95Ms: 410, status: "partial" } });
		await render(ResponseTimeChart, { days, windows: [30] });

		const chart = page.getByRole("slider", { name: "Response time" });
		(chart.element() as SVGSVGElement).focus();
		await expect
			.element(chart)
			.toHaveAttribute("aria-valuetext", "Oct 12: Average 100ms, p95 200ms");

		await userEvent.keyboard("{ArrowLeft}");

		await expect
			.element(chart)
			.toHaveAttribute("aria-valuetext", "Oct 11: Average 140ms, p95 410ms, Some checks failed");
	});

	it("says so instead of drawing an empty plot", async () => {
		const days = history(
			30,
			Object.fromEntries(
				Array.from({ length: 30 }, (_, i) => [i, { avgMs: null, p95Ms: null, status: "unknown" }]),
			),
		);
		await render(ResponseTimeChart, { days, windows: [30] });

		await expect
			.element(page.getByText("No response times recorded in this range yet."))
			.toBeInTheDocument();
		await expect.element(page.getByRole("slider")).not.toBeInTheDocument();
	});
});
