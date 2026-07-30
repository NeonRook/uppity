import { describe, expect, it } from "vitest";

import { getCheckIcon, getDayStatusColor, getMonitorStatusColor, getStatusColor } from "./status";

/** Any Tailwind palette literal. The system forbids these; see DESIGN.md. */
const PALETTE_LITERAL =
	/\b(?:bg|text|border|ring|fill|stroke)-(?:gray|slate|zinc|neutral|stone|green|emerald|teal|yellow|amber|orange|red|rose|blue|sky|indigo)-\d{2,3}\b/;

describe("getStatusColor", () => {
	it("maps up to the up signal token", () => {
		expect(getStatusColor("up", true)).toBe("bg-status-up");
	});

	it("maps degraded to the degraded signal token", () => {
		expect(getStatusColor("degraded", true)).toBe("bg-status-degraded");
	});

	it("maps down to the down signal token", () => {
		expect(getStatusColor("down", true)).toBe("bg-status-down");
	});

	it("maps an inactive monitor to the unknown signal token", () => {
		expect(getStatusColor("up", false)).toBe("bg-status-unknown");
	});

	it("maps an unrecognised status to the unknown signal token", () => {
		expect(getStatusColor("banana", true)).toBe("bg-status-unknown");
	});
});

describe("getMonitorStatusColor", () => {
	it("maps maintenance to the maintenance signal token", () => {
		expect(getMonitorStatusColor("maintenance")).toBe("bg-status-maintenance");
	});

	it("maps an unrecognised status to the unknown signal token", () => {
		expect(getMonitorStatusColor("banana")).toBe("bg-status-unknown");
	});
});

describe("getDayStatusColor", () => {
	it("maps partial to the partial signal token", () => {
		expect(getDayStatusColor("partial")).toBe("bg-status-partial");
	});

	it("returns no hover class, so callers own the hover treatment", () => {
		expect(getDayStatusColor("up")).not.toContain("hover:");
	});
});

describe("getCheckIcon", () => {
	it("maps up to the up signal text token", () => {
		expect(getCheckIcon("up").class).toBe("text-status-up");
	});
});

describe("the One Green Rule", () => {
	const statuses = ["up", "degraded", "down", "partial", "maintenance", "banana"];

	it("emits no Tailwind palette literal from any status helper", () => {
		const emitted = [
			...statuses.map((s) => getStatusColor(s, true)),
			...statuses.map((s) => getMonitorStatusColor(s)),
			...statuses.map((s) => getDayStatusColor(s)),
			...statuses.map((s) => getCheckIcon(s).class),
			getStatusColor("up", false),
		];

		for (const cls of emitted) {
			expect(cls).not.toMatch(PALETTE_LITERAL);
		}
	});
});
