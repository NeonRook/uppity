import { command, getRequestEvent } from "$app/server";
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
	const { locals } = getRequestEvent();
	if (!locals.user || locals.user.role !== "admin") {
		throw new Error("Admin access required");
	}
	await adminService.deleteOrganization(organizationId);
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
