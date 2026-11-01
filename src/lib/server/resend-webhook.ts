import { createHmac, timingSafeEqual } from "node:crypto";

import * as v from "valibot";

/** How far a signed timestamp may sit from this server's clock. */
const TOLERANCE_MS = 5 * 60_000;

const SECRET_PREFIX = "whsec_";

export interface SignedRequest {
	id: string | null;
	timestamp: string | null;
	signature: string | null;
	body: string;
}

/**
 * Checks a webhook's Svix signature: `v1,<base64 HMAC-SHA256>` entries, space separated, over
 * `id.timestamp.body` with the base64 key after the secret's prefix. A timestamp outside the
 * tolerance fails, so a captured request cannot be replayed.
 */
export function verifySignature(
	secret: string,
	{ id, timestamp, signature, body }: SignedRequest,
	now = Date.now(),
): boolean {
	if (!id || !timestamp || !signature) return false;

	const sentAt = Number(timestamp) * 1000;
	if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > TOLERANCE_MS) return false;

	const key = Buffer.from(secret.replace(SECRET_PREFIX, ""), "base64");
	const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

	return signature.split(" ").some((entry) => {
		const [version, value] = entry.split(",");
		if (version !== "v1" || !value) return false;
		const actual = Buffer.from(value, "base64");
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	});
}

const eventSchema = v.variant("type", [
	v.object({
		type: v.literal("email.bounced"),
		data: v.object({
			created_at: v.optional(v.string()),
			to: v.array(v.string()),
			bounce: v.object({ type: v.string() }),
		}),
	}),
	v.object({
		type: v.literal("email.complained"),
		data: v.object({ created_at: v.optional(v.string()), to: v.array(v.string()) }),
	}),
]);

export interface MailFailure {
	kind: "bounce" | "complaint";
	recipients: string[];
	/** When the provider took the email, which places it among our own sends. Null if unknown. */
	sentAt: Date | null;
}

const HANDLED = new Set(["email.bounced", "email.complained"]);

/**
 * The failure an event reports, or null when it asks nothing of us: another event type, or a
 * bounce that may clear up by itself. Throws on a bounce or complaint in an unknown shape.
 */
export function parseEvent(body: unknown): MailFailure | null {
	const type = (body as { type?: unknown } | null)?.type;
	if (typeof type !== "string" || !HANDLED.has(type)) return null;

	const event = v.parse(eventSchema, body);
	if (event.type === "email.bounced" && event.data.bounce.type !== "Permanent") return null;
	const sentAt = new Date(event.data.created_at ?? NaN);
	return {
		kind: event.type === "email.bounced" ? "bounce" : "complaint",
		recipients: event.data.to.map((address) => address.trim().toLowerCase()),
		sentAt: Number.isNaN(sentAt.getTime()) ? null : sentAt,
	};
}
