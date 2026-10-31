import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { relayAuthError } from "#lib/remote/auth-error.js";
import { requireOrganizationId } from "#lib/remote/organization.js";
import { auth } from "#lib/server/auth.js";
import { invitationService } from "#lib/server/services/invitation.instance.js";

const invitationIdSchema = v.object({
	invitationId: v.pipe(v.string(), v.minLength(1)),
});

const memberIdSchema = v.object({
	memberId: v.pipe(v.string(), v.minLength(1)),
});

// Query: Pending invitations to the signed-in user's own address
export const getMyInvitations = query(async () => {
	const { user } = getRequestEvent().locals;
	return user ? invitationService.pendingFor(user) : [];
});

export const cancelInvitation = command(invitationIdSchema, async ({ invitationId }) => {
	requireOrganizationId();
	const { request } = getRequestEvent();

	try {
		await auth.api.cancelInvitation({
			headers: request.headers,
			body: {
				invitationId,
			},
		});
	} catch (err) {
		relayAuthError(err);
	}
	return { success: true };
});

export const removeMember = command(memberIdSchema, async ({ memberId }) => {
	const { request, locals } = getRequestEvent();
	if (!locals.user) {
		error(401, "Not authenticated");
	}

	// Prevent removing yourself
	if (memberId === locals.user.id) {
		error(400, "You cannot remove yourself from the organization");
	}

	try {
		await auth.api.removeMember({
			headers: request.headers,
			body: {
				memberIdOrEmail: memberId,
			},
		});
	} catch (err) {
		relayAuthError(err);
	}
	return { success: true };
});

const deleteOrganizationSchema = v.object({
	organizationId: v.pipe(v.string(), v.minLength(1)),
});

export const deleteOrganization = command(deleteOrganizationSchema, async ({ organizationId }) => {
	const { request, locals } = getRequestEvent();
	if (!locals.user) {
		error(401, "Not authenticated");
	}

	try {
		await auth.api.deleteOrganization({
			headers: request.headers,
			body: {
				organizationId,
			},
		});
	} catch (err) {
		relayAuthError(err);
	}
	return { success: true };
});
