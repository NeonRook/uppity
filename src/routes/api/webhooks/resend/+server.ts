import { error } from "@sveltejs/kit";

import { db } from "#lib/server/db/index.js";
import { parseEvent, verifySignature, type MailFailure } from "#lib/server/resend-webhook.js";
import { recordMailFailure } from "#lib/server/services/mail-event.service.js";

import type { RequestHandler } from "./$types";

/** Bounces and complaints from the mail provider. Trusts nothing the signature does not cover. */
export const POST: RequestHandler = async ({ request }) => {
	const secret = process.env.RESEND_WEBHOOK_SECRET;
	if (!secret) error(503, "Webhook not configured");

	const body = await request.text();
	const id = request.headers.get("svix-id");
	const signed = verifySignature(secret, {
		id,
		timestamp: request.headers.get("svix-timestamp"),
		signature: request.headers.get("svix-signature"),
		body,
	});
	if (!signed || !id) error(401, "Invalid signature");

	let failure: MailFailure | null;
	try {
		failure = parseEvent(JSON.parse(body));
	} catch {
		error(400, "Unreadable event");
	}

	if (failure) await recordMailFailure(db, id, failure);
	return new Response(null, { status: 204 });
};
