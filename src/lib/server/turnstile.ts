import * as v from "valibot";

import { appUrl } from "./account-email";
import { logger } from "./logger";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;
const TOKEN_MAX_LENGTH = 2048;

/** What siteverify says about the visitor's token, rather than about this instance's setup. */
const TOKEN_ERRORS = new Set(["invalid-input-response", "timeout-or-duplicate"]);

const siteverifySchema = v.object({
	success: v.boolean(),
	action: v.optional(v.string()),
	hostname: v.optional(v.string()),
	"error-codes": v.optional(v.array(v.string()), []),
	metadata: v.optional(v.object({ result_with_testing_key: v.optional(v.boolean()) })),
});

if (!process.env.TURNSTILE_SITE_KEY !== !process.env.TURNSTILE_SECRET_KEY) {
	logger.error("Turnstile needs both keys; running without it");
}

/** The widget's public key, or undefined when this instance does not use Turnstile. */
export function turnstileSiteKey(): string | undefined {
	const { TURNSTILE_SITE_KEY: siteKey, TURNSTILE_SECRET_KEY: secret } = process.env;
	return siteKey && secret ? siteKey : undefined;
}

/**
 * Whether the token passes, or true when this instance does not use Turnstile. Siteverify
 * accepts a token once, so a retry needs a new one from the widget. The token must come from
 * the widget for `action` on this instance's host.
 *
 * Refuses when Cloudflare cannot answer. The widget comes from Cloudflare too, so an outage
 * mostly leaves visitors with no token at all, and passing on an error would let scripts
 * through for the little it saves.
 */
export async function verifyTurnstile(token: unknown, action: string): Promise<boolean> {
	if (!turnstileSiteKey()) return true;
	if (typeof token !== "string" || !token || token.length > TOKEN_MAX_LENGTH) return false;

	let result: v.InferOutput<typeof siteverifySchema>;
	try {
		const response = await fetch(SITEVERIFY_URL, {
			method: "POST",
			body: new URLSearchParams({
				secret: process.env.TURNSTILE_SECRET_KEY ?? "",
				response: token,
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		result = v.parse(siteverifySchema, await response.json());
	} catch (error) {
		logger.error({ error, action }, "Turnstile verification unavailable");
		return false;
	}

	if (!result.success) {
		const errors = result["error-codes"];
		if (!errors.every((code) => TOKEN_ERRORS.has(code))) {
			logger.error({ errors, action }, "Turnstile refused the request's credentials");
		}
		return false;
	}
	// Cloudflare's test keys answer with a placeholder host and no action.
	return (
		result.metadata?.result_with_testing_key === true ||
		(result.action === action && result.hostname === new URL(appUrl).hostname)
	);
}
