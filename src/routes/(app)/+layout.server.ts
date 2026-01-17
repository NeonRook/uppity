import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { member, organization } from "$lib/server/db/auth-schema";
import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	// Get user's organizations with roles
	const userMemberships = await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
			name: organization.name,
			slug: organization.slug,
		})
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, locals.user.id));

	// Auto-activate first organization if user has one but none is active
	if (locals.session && !locals.session.activeOrganizationId && userMemberships.length > 0) {
		const [firstOrg] = userMemberships;

		// Use better-auth API to set active organization
		await auth.api.setActiveOrganization({
			headers: request.headers,
			body: {
				organizationId: firstOrg.organizationId,
			},
		});

		// Update locals so the rest of the request sees the active org
		locals.session.activeOrganizationId = firstOrg.organizationId;
	}

	const activeOrgId = locals.session?.activeOrganizationId;
	const activeOrg = userMemberships.find((m) => m.organizationId === activeOrgId);

	return {
		user: locals.user,
		organizations: userMemberships.map((m) => ({
			id: m.organizationId,
			name: m.name,
			slug: m.slug,
			role: m.role,
		})),
		currentOrganization: activeOrg
			? {
					id: activeOrg.organizationId,
					name: activeOrg.name,
					slug: activeOrg.slug,
					role: activeOrg.role,
				}
			: null,
	};
};
