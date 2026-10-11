import { describe, expect, it } from "vitest";

import { redactUrl } from "./redact";

describe("redactUrl", () => {
	it("leaves a URL without secrets alone", () => {
		expect(redactUrl("https://api.example.com/health")).toBe("https://api.example.com/health");
	});

	it("drops credentials and the fragment", () => {
		expect(redactUrl("https://user:pass@api.example.com/health#token=abc")).toBe(
			"https://api.example.com/health",
		);
	});

	it("replaces every query value but keeps the names", () => {
		expect(redactUrl("https://example.com/x?token=abc&token=def&flag=&region=eu")).toBe(
			"https://example.com/x?token=***&token=***&flag=&region=***",
		);
	});

	it("returns null for null or an unparseable URL", () => {
		expect(redactUrl(null)).toBeNull();
		expect(redactUrl("not a url with secret")).toBeNull();
	});
});
