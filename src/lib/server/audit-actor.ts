import { db } from "$lib/server/db";
import { user } from "$lib/server/db/auth-schema";
import type { Actor } from "$lib/server/services/audit.service";
import type { RequestEvent } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

/**
 * Builds the audit actor for a request.
 *
 * `overrideUserId` exists for exactly one call site: stopping an impersonation.
 * During impersonation `locals.user` IS the impersonated user, so recording the
 * default actor would name the victim as the person who acted. The stop handler
 * passes `locals.session.impersonatedBy` to name the admin instead.
 */
export async function getActor(event: RequestEvent, overrideUserId?: string): Promise<Actor> {
	let ip: string | null = null;
	try {
		ip = event.getClientAddress();
	} catch {
		// Best effort — matches the handling in hooks.server.ts. Some adapters
		// cannot determine a client address and there is no recovery.
	}
	const userAgent = event.request.headers.get("user-agent");

	if (overrideUserId) {
		const [row] = await db
			.select({ id: user.id, email: user.email })
			.from(user)
			.where(eq(user.id, overrideUserId))
			.limit(1);

		if (!row) {
			throw new Error(`Cannot build audit actor: user ${overrideUserId} not found`);
		}

		return { id: row.id, email: row.email, ip, userAgent };
	}

	if (!event.locals.user) {
		throw new Error("Cannot build audit actor: no authenticated user on the request");
	}

	return { id: event.locals.user.id, email: event.locals.user.email, ip, userAgent };
}
