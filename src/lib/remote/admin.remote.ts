import { command, getRequestEvent } from "$app/server";
import { getActor } from "$lib/server/audit-actor";
import { auth } from "$lib/server/auth";
import { adminService } from "$lib/server/services/admin.service";
import * as v from "valibot";

const organizationIdSchema = v.object({
	organizationId: v.pipe(v.string(), v.minLength(1)),
});

const userIdSchema = v.object({
	userId: v.pipe(v.string(), v.minLength(1)),
});

export const deleteOrganization = command(organizationIdSchema, async ({ organizationId }) => {
	const event = getRequestEvent();
	if (!event.locals.user || event.locals.user.role !== "admin") {
		throw new Error("Admin access required");
	}
	const actor = await getActor(event);
	await adminService.deleteOrganization(actor, organizationId);
	return { success: true };
});

export const deleteUser = command(userIdSchema, async ({ userId }) => {
	const { request, locals } = getRequestEvent();
	if (!locals.user || locals.user.role !== "admin") {
		throw new Error("Admin access required");
	}
	await auth.api.removeUser({
		headers: request.headers,
		body: {
			userId,
		},
	});
	return { success: true };
});
