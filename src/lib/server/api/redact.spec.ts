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
		expect(redactUrl("https://example.com/x?token=abc&token=def&region=eu")).toBe(
			"https://example.com/x?token=***&token=***&region=***",
		);
	});

	it("masks a query parameter with no value, which may be a bare token", () => {
		expect(redactUrl("https://example.com/x?sk_live_abc&flag=&region=eu")).toBe(
			"https://example.com/x?***=&***=&region=***",
		);
	});

	it("returns null for null or an unparseable URL", () => {
		expect(redactUrl(null)).toBeNull();
		expect(redactUrl("not a url with secret")).toBeNull();
	});

	it("returns null for a URL that parses but is not http or https", () => {
		// With no scheme, `admin:` reads as one and the rest stays opaque to URL.
		expect(redactUrl("admin:hunter2@example.com/health")).toBeNull();
		expect(redactUrl("token:abc123")).toBeNull();
		expect(redactUrl("postgres://user:pass@db.example.com/app")).toBeNull();
	});
});
