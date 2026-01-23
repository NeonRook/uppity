import { updateOrganizationDetailsSchema, inviteMemberSchema } from "$lib/schemas/settings";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { member, organization } from "$lib/server/db/auth-schema";
import { fail, redirect } from "@sveltejs/kit";
import { count, eq } from "drizzle-orm";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

interface OrgMetadata {
	description?: string;
}

function parseMetadata(metadata: string | null): OrgMetadata {
	if (!metadata) return {};
	try {
		return JSON.parse(metadata) as OrgMetadata;
	} catch {
		return {};
	}
}

export const load: PageServerLoad = async ({ locals, request }) => {
	if (locals.user === null) redirect(302, "/login");
	if (!locals.session?.activeOrganizationId) redirect(302, "/settings");

	// Get full organization details including members
	const fullOrg = await auth.api.getFullOrganization({
		headers: request.headers,
		query: {
			organizationId: locals.session.activeOrganizationId,
		},
	});

	if (!fullOrg) redirect(302, "/settings");

	// Get organization from DB for metadata
	const [orgFromDb] = await db
		.select()
		.from(organization)
		.where(eq(organization.id, fullOrg.id))
		.limit(1);

	const metadata = parseMetadata(orgFromDb?.metadata ?? null);

	// Map members
	const currentOrgMembers = (fullOrg.members || []).map((m) => ({
		id: m.user.id,
		name: m.user.name,
		email: m.user.email,
		role: m.role,
	}));

	// Find current user's role
	const currentMember = fullOrg.members?.find((m) => m.user.id === locals.user!.id);
	const isOwner = currentMember?.role === "owner";
	const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

	// Get pending invitations
	const invitationsResult = await auth.api.listInvitations({
		headers: request.headers,
		query: {
			organizationId: locals.session.activeOrganizationId,
		},
	});

	const pendingInvitations = (invitationsResult || [])
		.filter((inv) => inv.status === "pending")
		.map((inv) => ({
			id: inv.id,
			email: inv.email,
			role: inv.role,
			createdAt: inv.expiresAt,
		}));

	// Get count of user's organizations (for delete validation)
	const [userOrgCount] = await db
		.select({ count: count() })
		.from(member)
		.where(eq(member.userId, locals.user.id));

	return {
		user: {
			id: locals.user.id,
			name: locals.user.name,
			email: locals.user.email,
		},
		currentOrganization: {
			id: fullOrg.id,
			name: fullOrg.name,
			slug: fullOrg.slug,
			logo: orgFromDb?.logo ?? null,
			description: metadata.description ?? "",
			createdAt: orgFromDb?.createdAt ?? null,
		},
		currentOrgMembers,
		pendingInvitations,
		isOwner,
		isAdmin,
		userOrgCount: userOrgCount?.count ?? 1,
	};
};

export const actions: Actions = {
	updateOrganization: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(400, { error: "No active organization" });
		}

		const form = await superValidate(request, valibot(updateOrganizationDetailsSchema));

		if (!form.valid) {
			const [firstError] = Object.values(form.errors).flat();
			return fail(400, { error: firstError ?? "Validation failed" });
		}

		// Check user's role
		const fullOrg = await auth.api.getFullOrganization({
			headers: request.headers,
			query: {
				organizationId: locals.session.activeOrganizationId,
			},
		});

		const currentMember = fullOrg?.members?.find((m) => m.user.id === locals.user!.id);
		const isOwner = currentMember?.role === "owner";
		const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin";

		if (!isAdmin) {
			return fail(403, { error: "You don't have permission to update this organization" });
		}

		// Only owners can change slug
		if (form.data.slug && !isOwner) {
			return fail(403, { error: "Only owners can change the organization slug" });
		}

		try {
			// Update name and slug via better-auth API
			await auth.api.updateOrganization({
				headers: request.headers,
				body: {
					data: {
						name: form.data.name,
						...(form.data.slug && isOwner ? { slug: form.data.slug } : {}),
						...(form.data.logo === undefined ? {} : { logo: form.data.logo || undefined }),
					},
					organizationId: locals.session.activeOrganizationId,
				},
			});

			// Update description in metadata (stored in DB directly)
			if (form.data.description !== undefined) {
				const [orgFromDb] = await db
					.select()
					.from(organization)
					.where(eq(organization.id, locals.session.activeOrganizationId))
					.limit(1);

				const existingMetadata = parseMetadata(orgFromDb?.metadata ?? null);
				const newMetadata = {
					...existingMetadata,
					description: form.data.description || undefined,
				};

				await db
					.update(organization)
					.set({ metadata: JSON.stringify(newMetadata) })
					.where(eq(organization.id, locals.session.activeOrganizationId));
			}

			return { success: true, orgUpdated: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Failed to update organization";
			return fail(500, { error: errorMessage });
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
