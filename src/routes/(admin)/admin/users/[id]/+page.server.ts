import { AUDIT_PANEL_LIMIT } from "$lib/constants/audit";
import { updateUserSchema } from "$lib/schemas/admin";
import { getActor } from "$lib/server/audit-actor";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { user } from "$lib/server/db/auth-schema";
import { adminService } from "$lib/server/services/admin.service";
import { auditService } from "$lib/server/services/audit.service";
import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

/** Email is the human-readable handle for a user in the audit log. */
async function userLabel(userId: string): Promise<string> {
	const [row] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return row?.email ?? userId;
}

export const load: PageServerLoad = async ({ params, request }) => {
	// Get all users and find the one with matching ID
	const result = await auth.api.listUsers({
		headers: request.headers,
		query: {
			limit: 1000,
			offset: 0,
		},
	});

	const foundUser = result.users.find((u) => u.id === params.id);

	if (!foundUser) {
		error(404, "User not found");
	}

	const form = await superValidate(
		{
			name: foundUser.name,
			email: foundUser.email,
			role: (foundUser.role as "user" | "admin") || "user",
			banned: foundUser.banned || false,
			banReason: foundUser.banReason || "",
		},
		valibot(updateUserSchema),
	);

	// A user with no sessions still returns an empty array, so a throw here means
	// a real failure — let it propagate rather than render a card that claims
	// there are no sessions when we simply could not read them.
	const sessions = await adminService.listUserSessions(request.headers, params.id);

	// Free: audit_target_idx covers (target_type, target_id), so this is an
	// index lookup rather than a scan.
	const { entries: history } = await auditService.list({
		targetType: "user",
		targetId: params.id,
		limit: AUDIT_PANEL_LIMIT,
	});

	return { user: foundUser, form, sessions, history };
};

export const actions: Actions = {
	update: async (event) => {
		const { request, params } = event;
		const form = await superValidate(request, valibot(updateUserSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const actor = await getActor(event);

			const [existing] = await db
				.select({ role: user.role, email: user.email })
				.from(user)
				.where(eq(user.id, params.id))
				.limit(1);

			if (!existing) {
				return fail(404, { form, message: "User not found" });
			}

			// Name and email go through Drizzle: better-auth's admin updateUser
			// endpoint does not accept a target userId.
			const updateData: Partial<typeof user.$inferInsert> = {};
			if (form.data.name) updateData.name = form.data.name;
			if (form.data.email) updateData.email = form.data.email;

			if (Object.keys(updateData).length > 0) {
				await db.update(user).set(updateData).where(eq(user.id, params.id));
				await auditService.record(db, actor, {
					action: "user.update",
					targetType: "user",
					targetId: params.id,
					targetLabel: form.data.email ?? existing.email,
					metadata: { changed: Object.keys(updateData) },
				});
			}

			if (form.data.role && form.data.role !== existing.role) {
				await adminService.setUserRole(
					actor,
					request.headers,
					params.id,
					form.data.role,
					existing.role ?? "user",
					form.data.email ?? existing.email,
				);
			}

			return { form, success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to update user";
			return fail(400, { form, message });
		}
	},

	ban: async (event) => {
		const { request, params } = event;
		const formData = await request.formData();
		const banReasonValue = formData.get("banReason");
		const reason =
			typeof banReasonValue === "string" && banReasonValue ? banReasonValue : undefined;

		try {
			const actor = await getActor(event);
			const label = await userLabel(params.id);
			await adminService.banUser(actor, request.headers, params.id, label, reason);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to ban user";
			return fail(400, { message });
		}

		return redirect(302, `/admin/users/${params.id}`);
	},

	unban: async (event) => {
		const { request, params } = event;

		try {
			const actor = await getActor(event);
			const label = await userLabel(params.id);
			await adminService.unbanUser(actor, request.headers, params.id, label);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to unban user";
			return fail(400, { message });
		}

		return redirect(302, `/admin/users/${params.id}`);
	},

	revokeSession: async (event) => {
		const { request, params } = event;
		const formData = await request.formData();
		const tokenValue = formData.get("sessionToken");
		const sessionToken = typeof tokenValue === "string" ? tokenValue : "";
		const ipValue = formData.get("ipAddress");
		const ipAddress = typeof ipValue === "string" && ipValue ? ipValue : null;

		if (!sessionToken) {
			return fail(400, { message: "Session token is required" });
		}

		try {
			const actor = await getActor(event);
			await adminService.revokeUserSession(
				actor,
				request.headers,
				sessionToken,
				params.id,
				ipAddress,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to revoke session";
			return fail(400, { message });
		}

		return redirect(302, `/admin/users/${params.id}`);
	},

	revokeAllSessions: async (event) => {
		const { request, params } = event;

		try {
			const actor = await getActor(event);
			const label = await userLabel(params.id);
			await adminService.revokeAllUserSessions(actor, request.headers, params.id, label);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to revoke sessions";
			return fail(400, { message });
		}

		return redirect(302, `/admin/users/${params.id}`);
	},

	impersonate: async (event) => {
		const { request, params } = event;

		try {
			const actor = await getActor(event);
			const label = await userLabel(params.id);
			await adminService.impersonateUser(actor, request.headers, params.id, label);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to impersonate user";
			return fail(400, { message });
		}

		return redirect(302, "/dashboard");
	},
};
