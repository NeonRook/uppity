import { describe, expect, it } from "vitest";

import { getImpactInfo, getStatusInfo } from "./incidents";

/** Any Tailwind palette literal. The system forbids these; see DESIGN.md. */
const PALETTE_LITERAL =
	/\b(?:bg|text|border|ring|fill|stroke)-(?:gray|slate|zinc|neutral|stone|green|emerald|teal|yellow|amber|orange|red|rose|blue|sky|indigo)-\d{2,3}\b/;

describe("getStatusInfo", () => {
	it("maps investigating to the down signal, the most urgent state", () => {
		const info = getStatusInfo("investigating");
		expect(info.bg).toBe("bg-status-down-surface");
		expect(info.color).toBe("text-status-down-ink");
	});

	it("maps identified to the partial signal", () => {
		expect(getStatusInfo("identified").bg).toBe("bg-status-partial-surface");
	});

	it("maps monitoring to the degraded signal", () => {
		expect(getStatusInfo("monitoring").bg).toBe("bg-status-degraded-surface");
	});

	it("maps resolved to the up signal", () => {
		expect(getStatusInfo("resolved").bg).toBe("bg-status-up-surface");
	});

	it("maps postmortem to the maintenance signal", () => {
		expect(getStatusInfo("postmortem").bg).toBe("bg-status-maintenance-surface");
	});

	it("maps an unrecognised status to the unknown signal", () => {
		expect(getStatusInfo("banana").bg).toBe("bg-status-unknown-surface");
	});
});

describe("getImpactInfo", () => {
	it("maps none to the unknown signal", () => {
		expect(getImpactInfo("none").bg).toBe("bg-status-unknown-surface");
	});

	it("maps minor to the degraded signal", () => {
		expect(getImpactInfo("minor").bg).toBe("bg-status-degraded-surface");
	});

	it("maps major to the partial signal", () => {
		expect(getImpactInfo("major").bg).toBe("bg-status-partial-surface");
	});

	it("maps critical to the down signal", () => {
		expect(getImpactInfo("critical").bg).toBe("bg-status-down-surface");
	});
});

describe("the One Green Rule", () => {
	it("emits no Tailwind palette literal from any incident helper", () => {
		const emitted = [
			...["investigating", "identified", "monitoring", "resolved", "postmortem", "banana"].flatMap(
				(s) => {
					const info = getStatusInfo(s);
					return [info.bg, info.color];
				},
			),
			...["none", "minor", "major", "critical", "banana"].flatMap((i) => {
				const info = getImpactInfo(i);
				return [info.bg, info.color];
			}),
		];

		for (const cls of emitted) {
			expect(cls).not.toMatch(PALETTE_LITERAL);
		}
	});
});
