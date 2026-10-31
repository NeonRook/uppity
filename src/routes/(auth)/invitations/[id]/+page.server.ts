import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";

import { m } from "#lib/paraglide/messages.js";
import { auth } from "#lib/server/auth.js";
import { invitationService } from "#lib/server/services/invitation.instance.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => ({
	view: locals.user
		? await invitationService.viewFor(params.id, locals.user)
		: { state: "signed_out" as const },
	email: locals.user?.email ?? "",
});

/** better-auth checks the recipient and their verified address on both answers. */
async function answer(call: () => Promise<unknown>) {
	try {
		await call();
	} catch (error) {
		if (!(error instanceof APIError)) throw error;
		const full = error.body?.code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED";
		return fail(error.statusCode, {
			error: full ? m.invitation_org_full() : m.invitation_invalid(),
		});
	}
	return redirect(303, "/dashboard");
}

export const actions: Actions = {
	accept: ({ params, request }) =>
		answer(() =>
			auth.api.acceptInvitation({
				headers: request.headers,
				body: { invitationId: params.id },
			}),
		),
	decline: ({ params, request }) =>
		answer(() =>
			auth.api.rejectInvitation({
				headers: request.headers,
				body: { invitationId: params.id },
			}),
		),
};
