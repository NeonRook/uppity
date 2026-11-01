import { afterEach, describe, expect, test, vi } from "vitest";

import { envIntBetween } from "./utils";

describe("envIntBetween", () => {
	afterEach(() => vi.unstubAllEnvs());

	test.each([
		["unset", undefined, 5],
		["empty", "", 5],
		["not a number", "soon", 5],
		["below the range", "-1", 5],
		["above the range", "99999999999999", 5],
		["the lowest value", "2", 2],
		["the highest value", "10", 10],
	])("%s", (_, value, expected) => {
		vi.stubEnv("UPPITY_FLAP_THRESHOLD", value);
		expect(envIntBetween("UPPITY_FLAP_THRESHOLD", 5, 2, 10)).toBe(expected);
	});
});
