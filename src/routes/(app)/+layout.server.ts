import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { member } from "$lib/server/db/auth-schema";
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	// Auto-activate first organization if user has one but none is active
	if (locals.session && !locals.session.activeOrganizationId) {
		const [firstMembership] = await db
			.select({ organizationId: member.organizationId })
			.from(member)
			.where(eq(member.userId, locals.user.id))
			.limit(1);

		if (firstMembership) {
			// Use better-auth API to set active organization
			await auth.api.setActiveOrganization({
				headers: request.headers,
				body: {
					organizationId: firstMembership.organizationId,
				},
			});

			// Update locals so the rest of the request sees the active org
			locals.session.activeOrganizationId = firstMembership.organizationId;
		}
	}

	return {
		user: locals.user,
	};
};
