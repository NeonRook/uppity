import { getActor } from "$lib/server/audit-actor";
import { adminService } from "$lib/server/services/admin.service";
import { redirect } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

/**
 * Stops an active impersonation.
 *
 * This is a `+server.ts` endpoint rather than a form action because the banner
 * that triggers it lives in the `(app)` layout, and SvelteKit only allows
 * actions in `+page.server.ts`. A plain form posting to a fixed path is the
 * only shape usable from every page under the layout.
 */
export const POST: RequestHandler = async (event) => {
	const { locals, request } = event;

	const adminId = locals.session?.impersonatedBy;
	const impersonatedUserId = locals.user?.id;

	// No active impersonation: a no-op, not an error. A double-submit or a stale
	// tab must not produce a 500. This must come before getActor, which throws
	// on a request with no authenticated user.
	if (!adminId || !impersonatedUserId) {
		redirect(302, "/dashboard");
	}

	// The actor is the ADMIN, not locals.user — during impersonation locals.user
	// is the impersonated user, and auditing them as the actor would record the
	// subject of the action as its author.
	const actor = await getActor(event, adminId);
	const label = locals.user?.email ?? impersonatedUserId;

	await adminService.stopImpersonating(actor, request.headers, impersonatedUserId, label);

	redirect(302, `/admin/users/${impersonatedUserId}`);
};
