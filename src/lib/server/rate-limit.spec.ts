import { describe, expect, it } from "vitest";

import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
	it("allows up to the limit within a window, then refuses", () => {
		const limiter = new RateLimiter(2, 1000);
		expect([0, 1, 2].map((t) => limiter.attempt("a", t))).toEqual([true, true, false]);
	});

	it("counts each key separately", () => {
		const limiter = new RateLimiter(1, 1000);
		expect(limiter.attempt("a", 0)).toBe(true);
		expect(limiter.attempt("b", 0)).toBe(true);
		expect(limiter.attempt("a", 0)).toBe(false);
	});

	it("starts a fresh window once the old one ends", () => {
		const limiter = new RateLimiter(1, 1000);
		limiter.attempt("a", 0);
		expect(limiter.attempt("a", 999)).toBe(false);
		expect(limiter.attempt("a", 1000)).toBe(true);
	});
});
