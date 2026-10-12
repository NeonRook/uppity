import { command, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { relayAuthError } from "#lib/remote/auth-error.js";
import { getActor } from "#lib/server/audit-actor.js";
import { auth } from "#lib/server/auth.js";
import { adminService } from "#lib/server/services/admin.service.js";

const organizationIdSchema = v.object({
	organizationId: v.pipe(v.string(), v.minLength(1)),
});

const userIdSchema = v.object({
	userId: v.pipe(v.string(), v.minLength(1)),
});

export const deleteOrganization = command(organizationIdSchema, async ({ organizationId }) => {
	const event = getRequestEvent();
	if (!event.locals.user || event.locals.user.role !== "admin") {
		error(403, "Admin access required");
	}
	const actor = await getActor(event);
	await adminService.deleteOrganization(actor, organizationId);
	return { success: true };
});

export const deleteUser = command(userIdSchema, async ({ userId }) => {
	const { request, locals } = getRequestEvent();
	if (!locals.user || locals.user.role !== "admin") {
		error(403, "Admin access required");
	}
	try {
		await auth.api.removeUser({
			headers: request.headers,
			body: {
				userId,
			},
		});
	} catch (err) {
		relayAuthError(err);
	}
	return { success: true };
});
