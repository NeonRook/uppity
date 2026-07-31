import { describe, expect, test } from "vitest";

import { DEFAULT_PLAN_ID, isSelfHosted, retentionGroups } from "./plans";

describe("retentionGroups", () => {
	test("groups plans by window, with -1 following the fallback", () => {
		const groups = retentionGroups(30);

		// free is 30, uppity is 365, dedicated and enterprise are -1 -> 30.
		const byDays = new Map(groups.map((g) => [g.days, g.planIds]));
		expect([...byDays.keys()].toSorted((a, b) => a - b)).toEqual([30, 365]);
		expect(byDays.get(30)?.slice().toSorted()).toEqual(["dedicated", "enterprise", "free"]);
		expect(byDays.get(365)).toEqual(["uppity"]);
	});

	test("a different fallback splits the -1 plans away from free", () => {
		const groups = retentionGroups(90);

		const byDays = new Map(groups.map((g) => [g.days, g.planIds]));
		expect([...byDays.keys()].toSorted((a, b) => a - b)).toEqual([30, 90, 365]);
		expect(byDays.get(30)).toEqual(["free"]);
		expect(byDays.get(90)?.slice().toSorted()).toEqual(["dedicated", "enterprise"]);
	});

	test("exactly one group is the catch-all, and it contains the default plan", () => {
		for (const fallback of [30, 90]) {
			const groups = retentionGroups(fallback);
			const catchAll = groups.filter((g) => g.catchAll);

			expect(catchAll).toHaveLength(1);
			expect(catchAll[0].planIds).toContain(DEFAULT_PLAN_ID);
		}
	});
});

describe("isSelfHosted", () => {
	test("is true only for the exact string 'true'", () => {
		const original = process.env.SELF_HOSTED;
		try {
			process.env.SELF_HOSTED = "true";
			expect(isSelfHosted()).toBe(true);

			process.env.SELF_HOSTED = "TRUE";
			expect(isSelfHosted()).toBe(false);

			process.env.SELF_HOSTED = "";
			expect(isSelfHosted()).toBe(false);

			delete process.env.SELF_HOSTED;
			expect(isSelfHosted()).toBe(false);
		} finally {
			if (original === undefined) delete process.env.SELF_HOSTED;
			else process.env.SELF_HOSTED = original;
		}
	});
});
