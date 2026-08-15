import { describe, expect, test } from "vitest";

import {
	applyCapacityBlocks,
	DEDICATED_PLAN,
	DEFAULT_PLAN_ID,
	FREE_PLAN,
	isSelfHosted,
	retentionGroups,
	UPPITY_PLAN,
} from "./plans";

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

describe("applyCapacityBlocks", () => {
	test("uppity with no blocks keeps the included 50-monitor allowance", () => {
		expect(applyCapacityBlocks(UPPITY_PLAN, 0).monitors).toBe(50);
	});

	test("each uppity block adds 50 monitors on top of the included allowance", () => {
		expect(applyCapacityBlocks(UPPITY_PLAN, 1).monitors).toBe(100);
		expect(applyCapacityBlocks(UPPITY_PLAN, 3).monitors).toBe(200);
		expect(applyCapacityBlocks(UPPITY_PLAN, 20).monitors).toBe(1050);
	});

	test("blocks change nothing but the monitor ceiling", () => {
		const { monitors: _base, ...rest } = UPPITY_PLAN.limits;
		const { monitors: _derived, ...derivedRest } = applyCapacityBlocks(UPPITY_PLAN, 4);
		expect(derivedRest).toEqual(rest);
	});

	test("free ignores blocks — capacity is only sold on top of Uppity", () => {
		expect(applyCapacityBlocks(FREE_PLAN, 5).monitors).toBe(FREE_PLAN.limits.monitors);
	});

	test("dedicated ignores blocks — its 2000 is a fair-use figure, not a purchasable base", () => {
		expect(applyCapacityBlocks(DEDICATED_PLAN, 5).monitors).toBe(DEDICATED_PLAN.limits.monitors);
	});

	test("an unlimited ceiling stays unlimited rather than becoming 49", () => {
		const unlimited = { ...UPPITY_PLAN, limits: { ...UPPITY_PLAN.limits, monitors: -1 } };
		expect(applyCapacityBlocks(unlimited, 2).monitors).toBe(-1);
	});

	test("a negative block count cannot shrink the included allowance", () => {
		expect(applyCapacityBlocks(UPPITY_PLAN, -3).monitors).toBe(50);
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
