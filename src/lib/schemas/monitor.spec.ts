import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { BODY_MATCH_MAX_LENGTH, MAX_RETRIES, MAX_TIMEOUT_SECONDS } from "#lib/constants/monitor.js";
import { toMonitorInput } from "#lib/server/monitor-input.js";

import { createMonitorSchema } from "./monitor";

const http = { type: "http", name: "Site", url: "https://example.com" } as const;
const parse = (fields: Record<string, unknown>) =>
	v.safeParse(createMonitorSchema, { ...http, ...fields });

describe("createMonitorSchema", () => {
	it("defaults to following redirects and refusing self-signed certificates", () => {
		const parsed = v.parse(createMonitorSchema, http);
		expect(toMonitorInput(parsed)).toMatchObject({
			followRedirects: true,
			acceptSelfSigned: false,
			expectedBodyContains: null,
		});
	});

	it("accepts http and https URLs in any spelling", () => {
		for (const url of ["http://example.com", "HTTPS://example.com/health"]) {
			expect(parse({ url }).success).toBe(true);
		}
	});

	it("rejects a URL that is not http or https", () => {
		for (const url of [
			"admin:hunter2@example.com/health",
			"data:text/html,hi",
			"ftp://example.com/",
		]) {
			expect(parse({ url }).success).toBe(false);
		}
	});

	it("accepts body text up to the limit", () => {
		expect(parse({ expectedBodyContains: "a".repeat(BODY_MATCH_MAX_LENGTH) }).success).toBe(true);
	});

	it("rejects body text over the limit", () => {
		expect(parse({ expectedBodyContains: "a".repeat(BODY_MATCH_MAX_LENGTH + 1) }).success).toBe(
			false,
		);
	});

	it("accepts the maximum timeout and retries", () => {
		expect(parse({ timeoutSeconds: MAX_TIMEOUT_SECONDS, retries: MAX_RETRIES }).success).toBe(true);
	});

	it("rejects a timeout past the maximum", () => {
		expect(parse({ timeoutSeconds: MAX_TIMEOUT_SECONDS + 1 }).success).toBe(false);
	});

	it("rejects retries past the maximum", () => {
		expect(parse({ retries: MAX_RETRIES + 1 }).success).toBe(false);
	});
});
