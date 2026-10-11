/**
 * Authentication for the public `/api/v1` surface. A key proves which organization is
 * calling; the organization's current plan decides what it may do. See
 * `docs/adr/0006-api-keys-on-better-auth-plugin.md`.
 */

import {
	API_KEYS_PER_ORGANIZATION,
	API_RATE_LIMIT_WINDOW_MS,
	API_REQUESTS_PER_MINUTE,
} from "#lib/constants/api.js";
import type { ApiAccessLevel, PlanLimits } from "#lib/types/plans.js";

export interface ApiCaller {
	organizationId: string;
	keyId: string;
	access: Exclude<ApiAccessLevel, "none">;
}

/** The fields of `auth.api.verifyApiKey`'s result this module reads. */
export interface VerifiedKey {
	valid: boolean;
	error: { code?: string; details?: { tryAgainIn?: number } } | null;
	key: {
		id: string;
		referenceId: string;
		rateLimitMax: number | null;
		rateLimitTimeWindow: number | null;
	} | null;
}

export interface ApiAuthDeps {
	verify: (key: string) => Promise<VerifiedKey>;
	limits: (organizationId: string) => Promise<PlanLimits>;
	setRateLimit: (keyId: string, max: number, windowMs: number) => Promise<void>;
}

const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

const CHALLENGE = { "www-authenticate": "Bearer" };

export function requestsPerMinute(limits: PlanLimits): number {
	return limits.apiRequestsPerMinute === -1 ? API_REQUESTS_PER_MINUTE : limits.apiRequestsPerMinute;
}

function problem(
	status: number,
	code: string,
	message: string,
	headers?: Record<string, string>,
): Response {
	return Response.json({ error: { code, message } }, { status, headers });
}

/** The caller behind `request`, or the error response to send instead. */
export async function authenticateApiRequest(
	request: Request,
	deps: ApiAuthDeps,
): Promise<ApiCaller | Response> {
	const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
	if (!bearer) {
		return problem(
			401,
			"unauthorized",
			"Send an API key as `Authorization: Bearer <key>`.",
			CHALLENGE,
		);
	}

	const { valid, error, key } = await deps.verify(bearer);
	if (!valid || !key) {
		if (error?.code === "RATE_LIMITED") {
			const waitMs = error.details?.tryAgainIn ?? API_RATE_LIMIT_WINDOW_MS;
			return problem(429, "rate_limited", "Too many requests for this API key.", {
				"retry-after": String(Math.max(1, Math.ceil(waitMs / 1000))),
			});
		}
		return problem(401, "unauthorized", "The API key is invalid, expired or revoked.", CHALLENGE);
	}

	const limits = await deps.limits(key.referenceId);

	// The plugin stores the limit on the key at creation, so a plan change leaves it
	// stale until this request corrects it.
	const max = requestsPerMinute(limits);
	if (key.rateLimitMax !== max || key.rateLimitTimeWindow !== API_RATE_LIMIT_WINDOW_MS) {
		await deps.setRateLimit(key.id, max, API_RATE_LIMIT_WINDOW_MS);
	}

	const access = limits.apiAccess;
	if (access === "none") {
		return problem(403, "forbidden", "This organization's plan does not include API access.");
	}
	if (access === "read" && !READ_METHODS.has(request.method)) {
		return problem(403, "forbidden", "This organization's plan includes read-only API access.");
	}

	return { organizationId: key.referenceId, keyId: key.id, access };
}

/**
 * Why a key creation must be refused, or null when it may proceed. The plugin rejects
 * a request without an organization on its own.
 *
 * Two concurrent creations can both pass at nine keys. One key over the cap does not
 * matter for a limit that exists to stop multiplying the rate limit tenfold.
 */
export async function refuseApiKeyCreate(
	body: unknown,
	countKeys: (organizationId: string) => Promise<number>,
): Promise<string | null> {
	const organizationId =
		typeof body === "object" && body !== null ? Reflect.get(body, "organizationId") : undefined;
	if (typeof organizationId !== "string" || organizationId === "") return null;

	if ((await countKeys(organizationId)) < API_KEYS_PER_ORGANIZATION) return null;
	return `An organization can hold ${API_KEYS_PER_ORGANIZATION} API keys. Revoke one to create another.`;
}
