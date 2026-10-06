import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

import { isSelfHosted } from "#lib/constants/plans.js";
import { auth } from "#lib/server/auth.js";
import { member, organization } from "#lib/server/db/auth-schema.js";
import { db } from "#lib/server/db/index.js";
import { getUsageLimitsData } from "#lib/server/services/usage-limits.js";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	// Get user's organizations with roles
	const userMemberships = await db
		.select({
			id: member.organizationId,
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
				organizationId: firstOrg.id,
			},
		});

		// Update locals so the rest of the request sees the active org
		locals.session.activeOrganizationId = firstOrg.id;
	}

	const activeOrgId = locals.session?.activeOrganizationId;

	// Get usage limits for the active organization
	const usageLimits = activeOrgId ? await getUsageLimitsData(activeOrgId) : null;

	// During impersonation locals.user is the impersonated user; the banner names
	// them so the operator always knows whose view they are looking at.
	const impersonating = locals.session?.impersonatedBy
		? { userId: locals.user.id, name: locals.user.name }
		: null;

	return {
		user: locals.user,
		impersonating,
		organizations: userMemberships,
		currentOrganization: userMemberships.find((org) => org.id === activeOrgId) ?? null,
		usageLimits,
		selfHosted: isSelfHosted(),
	};
};
