import { updateProfileSchema, createOrganizationSchema } from "$lib/schemas/settings";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { member } from "$lib/server/db/auth-schema";
import { isSelfHosted } from "$lib/server/services/subscription.service";
import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, request }) => {
	if (locals.user === null) redirect(302, "/login");

	// Get user's organizations using better-auth API
	const orgsResult = await auth.api.listOrganizations({
		headers: request.headers,
	});

	const organizations = orgsResult || [];

	// Get user's membership roles for all organizations
	const userMemberships = await db
		.select({ organizationId: member.organizationId, role: member.role })
		.from(member)
		.where(eq(member.userId, locals.user.id));

	const roleByOrgId = new Map(userMemberships.map((m) => [m.organizationId, m.role]));

	// Get current organization basic info
	let currentOrganization = null;
	let isAdmin = false;

	if (locals.session?.activeOrganizationId) {
		const org = organizations.find((o) => o.id === locals.session!.activeOrganizationId);
		if (org) {
			currentOrganization = {
				id: org.id,
				name: org.name,
				slug: org.slug,
			};
			const role = roleByOrgId.get(org.id);
			isAdmin = role === "owner" || role === "admin";
		}
	}

	return {
		user: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
		},
		organizations: organizations.map((o) => ({
			id: o.id,
			name: o.name,
			slug: o.slug,
			role: roleByOrgId.get(o.id) ?? "member",
		})),
		currentOrganization,
		isAdmin,
		selfHosted: isSelfHosted(),
	};
};

export const actions: Actions = {
	updateProfile: async ({ request }) => {
		const form = await superValidate(request, valibot(updateProfileSchema));

		if (!form.valid) {
			return fail(400, { error: "Name is required" });
		}

		try {
			await auth.api.updateUser({
				headers: request.headers,
				body: {
					name: form.data.name,
				},
			});
			return { success: true, profileUpdated: true };
		} catch {
			return fail(500, { error: "Failed to update profile" });
		}
	},

	createOrganization: async ({ request }) => {
		const form = await superValidate(request, valibot(createOrganizationSchema));

		if (!form.valid) {
			return fail(400, { error: "Organization name is required" });
		}

		const slug = form.data.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");

		try {
			await auth.api.createOrganization({
				headers: request.headers,
				body: {
					name: form.data.name,
					slug: `${slug}-${Math.random().toString(36).substring(2, 8)}`,
				},
			});
			return { success: true, orgCreated: true };
		} catch {
			return fail(500, { error: "Failed to create organization" });
		}
	},
};
