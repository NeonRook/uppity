import { describe, expect, it } from "vitest";

import { sameOriginPath } from "./same-origin-path";

const origin = "https://uppity.cloud";

describe("sameOriginPath", () => {
	it("keeps a local path with its query", () => {
		expect(sameOriginPath("/verify-email?token=abc", origin)).toBe("/verify-email?token=abc");
	});

	it.each([
		"//evil.com",
		"/\\evil.com",
		"/\t/evil.com",
		"/.//evil.com",
		"/invitations/..//evil.com",
		"/./\\evil.com",
		"https://evil.com/",
		["javascript", "alert(1)"].join(":"),
	])("refuses %j", (target) => {
		expect(sameOriginPath(target, origin)).toBeNull();
	});

	it("refuses a missing target", () => {
		expect(sameOriginPath(null, origin)).toBeNull();
	});
});
