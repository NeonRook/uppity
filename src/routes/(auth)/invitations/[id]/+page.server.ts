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

function refusal(error: APIError) {
	if (error.statusCode === 409) return m.invitation_busy();
	if (error.body?.code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED") return m.invitation_org_full();
	return m.invitation_invalid();
}

/** better-auth checks the recipient and their verified address on both answers. */
async function answer(call: () => Promise<unknown>) {
	try {
		await call();
	} catch (error) {
		if (!(error instanceof APIError)) throw error;
		return fail(error.statusCode, { error: refusal(error) });
	}
	return redirect(303, "/dashboard");
}

export const actions: Actions = {
	accept: ({ params, request }) =>
		answer(() =>
			invitationService.accept(params.id, () =>
				auth.api.acceptInvitation({
					headers: request.headers,
					body: { invitationId: params.id },
				}),
			),
		),
	decline: ({ params, request }) =>
		answer(() =>
			auth.api.rejectInvitation({
				headers: request.headers,
				body: { invitationId: params.id },
			}),
		),
};
