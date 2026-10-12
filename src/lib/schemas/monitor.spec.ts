import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { MAX_RETRIES, MAX_TIMEOUT_SECONDS } from "#lib/constants/defaults.js";

import { createMonitorSchema } from "./monitor";

const http = (fields: Record<string, unknown>) =>
	v.safeParse(createMonitorSchema, {
		type: "http",
		name: "Site",
		url: "https://example.com",
		...fields,
	});

describe("createMonitorSchema bounds", () => {
	it("accepts the maximum timeout and retries", () => {
		expect(http({ timeoutSeconds: MAX_TIMEOUT_SECONDS, retries: MAX_RETRIES }).success).toBe(true);
	});

	it("rejects a timeout past the maximum", () => {
		expect(http({ timeoutSeconds: MAX_TIMEOUT_SECONDS + 1 }).success).toBe(false);
	});

	it("rejects retries past the maximum", () => {
		expect(http({ retries: MAX_RETRIES + 1 }).success).toBe(false);
	});
});
