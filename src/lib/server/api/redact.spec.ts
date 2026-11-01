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

	it("masks a query name that does not read as a plain name", () => {
		expect(redactUrl("https://example.com/x?a;hunter2=1&a:hunter2=2&a+hunter2=3")).toBe(
			"https://example.com/x?***=***&***=***&***=***",
		);
		expect(redactUrl(`https://example.com/x?${"a".repeat(25)}=1`)).toBe(
			"https://example.com/x?***=***",
		);
	});

	it("masks a bare token that ends in base64 padding", () => {
		expect(redactUrl("https://example.com/x?aHVudGVyMg==&aHVudGVy===")).toBe(
			"https://example.com/x?***=&***=",
		);
	});

	it("keeps a plain name that has a real value, even if the name is a secret", () => {
		expect(redactUrl("https://example.com/x?a-hunter2=1&b==c")).toBe(
			"https://example.com/x?a-hunter2=***&b=***",
		);
	});

	it("keeps a long ordinary parameter name", () => {
		expect(redactUrl("https://example.com/x?X-Amz-SignedHeaders=host")).toBe(
			"https://example.com/x?X-Amz-SignedHeaders=***",
		);
	});

	it("masks matrix parameters and keeps the rest of the path", () => {
		expect(redactUrl("https://example.com/a;jsessionid=hunter2/b;v=1?c=d")).toBe(
			"https://example.com/a;***/b;***?c=***",
		);
	});

	it("removes userinfo however the URL spells it", () => {
		for (const raw of [
			"HTTP://u:hunter2@example.com/",
			"http:u:hunter2@example.com/",
			"http:\\\\u:hunter2@example.com\\",
			"  http://u:hunter2@example.com/  ",
			"ht\ntp://u:\thunter2@example.com/",
			"http://a@b@c:hunter2@example.com/",
			"http://u%3Ahunter2@example.com/",
		]) {
			expect(redactUrl(raw)).toBe("http://example.com/");
		}
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
