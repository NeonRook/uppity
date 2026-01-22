import {
	updateProfileSchema,
	updateOrganizationSchema,
	createOrganizationSchema,
	inviteMemberSchema,
} from "$lib/schemas/settings";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { member } from "$lib/server/db/auth-schema";
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

	// Get current organization details with members
	let currentOrganization = null;
	let currentOrgMembers: Array<{
		id: string;
		name: string;
		email: string;
		role: string;
	}> = [];
	let pendingInvitations: Array<{
		id: string;
		email: string;
		role: string;
		createdAt: Date;
	}> = [];
	let isOwner = false;
	let isAdmin = false;

	if (locals.session?.activeOrganizationId) {
		// Get full organization details including members
		const fullOrg = await auth.api.getFullOrganization({
			headers: request.headers,
			query: {
				organizationId: locals.session.activeOrganizationId,
			},
		});

		if (fullOrg) {
			currentOrganization = {
				id: fullOrg.id,
				name: fullOrg.name,
				slug: fullOrg.slug,
			};

			// Map members
			currentOrgMembers = (fullOrg.members || []).map((m) => ({
				id: m.user.id,
				name: m.user.name,
				email: m.user.email,
				role: m.role,
			}));

			// Find current user's role
			const currentMember = fullOrg.members?.find((m) => m.user.id === locals.user!.id);
			isOwner = currentMember?.role === "owner";
			isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";
		}

		// Get pending invitations
		const invitationsResult = await auth.api.listInvitations({
			headers: request.headers,
			query: {
				organizationId: locals.session.activeOrganizationId,
			},
		});

		pendingInvitations = (invitationsResult || [])
			.filter((inv) => inv.status === "pending")
			.map((inv) => ({
				id: inv.id,
				email: inv.email,
				role: inv.role,
				createdAt: inv.expiresAt, // Use expiresAt as proxy
			}));
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
		currentOrgMembers,
		pendingInvitations,
		isOwner,
		isAdmin,
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

	updateOrganization: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(400, { error: "No active organization" });
		}

		const form = await superValidate(request, valibot(updateOrganizationSchema));

		if (!form.valid) {
			return fail(400, { error: "Organization name is required" });
		}

		try {
			await auth.api.updateOrganization({
				headers: request.headers,
				body: {
					data: {
						name: form.data.name,
					},
					organizationId: locals.session.activeOrganizationId,
				},
			});
			return { success: true, orgUpdated: true };
		} catch {
			return fail(500, { error: "Failed to update organization" });
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

	inviteMember: async ({ request }) => {
		const form = await superValidate(request, valibot(inviteMemberSchema));

		if (!form.valid) {
			return fail(400, { error: "Valid email is required" });
		}

		try {
			await auth.api.createInvitation({
				headers: request.headers,
				body: {
					email: form.data.email,
					role: form.data.role ?? "member",
				},
			});
			return { success: true, inviteSent: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Failed to send invitation";
			return fail(400, { error: errorMessage });
		}
	},
};
