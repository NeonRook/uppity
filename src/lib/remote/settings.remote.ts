import { command, getRequestEvent } from "$app/server";
import { auth } from "$lib/server/auth";
import * as v from "valibot";

const invitationIdSchema = v.object({
	invitationId: v.pipe(v.string(), v.minLength(1)),
});

const memberIdSchema = v.object({
	memberId: v.pipe(v.string(), v.minLength(1)),
});

export const cancelInvitation = command(invitationIdSchema, async ({ invitationId }) => {
	const { request, locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	try {
		await auth.api.cancelInvitation({
			headers: request.headers,
			body: {
				invitationId,
			},
		});
		return { success: true };
	} catch {
		throw new Error("Failed to cancel invitation");
	}
});

export const removeMember = command(memberIdSchema, async ({ memberId }) => {
	const { request, locals } = getRequestEvent();
	if (!locals.user) {
		throw new Error("Not authenticated");
	}

	// Prevent removing yourself
	if (memberId === locals.user.id) {
		throw new Error("You cannot remove yourself from the organization");
	}

	try {
		await auth.api.removeMember({
			headers: request.headers,
			body: {
				memberIdOrEmail: memberId,
			},
		});
		return { success: true };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Failed to remove member";
		throw new Error(errorMessage, { cause: error });
	}
});

const deleteOrganizationSchema = v.object({
	organizationId: v.pipe(v.string(), v.minLength(1)),
});

export const deleteOrganization = command(deleteOrganizationSchema, async ({ organizationId }) => {
	const { request, locals } = getRequestEvent();
	if (!locals.user) {
		throw new Error("Not authenticated");
	}

	try {
		await auth.api.deleteOrganization({
			headers: request.headers,
			body: {
				organizationId,
			},
		});
		return { success: true };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Failed to delete organization";
		throw new Error(errorMessage, { cause: error });
	}
});
