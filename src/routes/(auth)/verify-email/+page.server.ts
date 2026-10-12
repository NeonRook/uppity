import { redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";

import { auth } from "#lib/server/auth.js";
import { logger } from "#lib/server/logger/index.js";
import { emailChannelService } from "#lib/server/services/email-channel.instance.js";

import type { PageServerLoad } from "./$types";

// Verifies only inside the account's own session; see beforeEmailVerification in auth.ts.
export const load: PageServerLoad = async ({ url, locals, request }) => {
	const token = url.searchParams.get("token");
	if (!token) return { outcome: "invalid" as const };
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}
	if (locals.user.emailVerified) {
		// Finishes the channel step if it failed after the address was verified.
		await emailChannelService.confirmMemberAddress(locals.user.email);
		redirect(303, "/dashboard");
	}

	try {
		await auth.api.verifyEmail({ query: { token }, headers: request.headers });
	} catch (error) {
		if (error instanceof APIError && error.status === "FORBIDDEN") {
			return { outcome: "other_account" as const, email: locals.user.email };
		}
		if (!(error instanceof APIError)) {
			logger.error({ user_id: locals.user.id, error }, "Email verification failed");
		}
		return { outcome: "invalid" as const };
	}
	return redirect(303, "/dashboard");
};
