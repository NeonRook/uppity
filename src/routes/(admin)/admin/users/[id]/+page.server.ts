import { error, fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import { AUDIT_PANEL_LIMIT } from "#lib/constants/audit.js";
import { updateUserSchema } from "#lib/schemas/admin.js";
import { getActor } from "#lib/server/audit-actor.js";
import { auth } from "#lib/server/auth.js";
import { user } from "#lib/server/db/auth-schema.js";
import { db } from "#lib/server/db/index.js";
import { adminService } from "#lib/server/services/admin.service.js";
import { auditService, type Actor } from "#lib/server/services/audit.service.js";

import type { Actions, PageServerLoad, RequestEvent } from "./$types";

/** Email is the human-readable handle for a user in the audit log. */
async function userLabel(userId: string): Promise<string> {
	const [row] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return row?.email ?? userId;
}

/**
 * Runs an audited action against the user in the route, then returns to the
 * user's page (or `to`). A failure re-renders the page with its message.
 */
async function userAction(
	event: RequestEvent,
	fallback: string,
	run: (actor: Actor, label: string) => Promise<unknown>,
	to = `/admin/users/${event.params.id}`,
) {
	try {
		await run(await getActor(event), await userLabel(event.params.id));
	} catch (err) {
		return fail(400, { message: err instanceof Error ? err.message : fallback });
	}

	return redirect(302, to);
}

export const load: PageServerLoad = async ({ params, request }) => {
	const foundUser = await auth.api
		.getUser({ headers: request.headers, query: { id: params.id } })
		.catch((err: unknown) => {
			if (err instanceof APIError && err.status === "NOT_FOUND") {
				error(404, "User not found");
			}
			throw err;
		});

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
		const banReasonValue = (await event.request.formData()).get("banReason");
		const reason =
			typeof banReasonValue === "string" && banReasonValue ? banReasonValue : undefined;

		return userAction(event, "Failed to ban user", (actor, label) =>
			adminService.banUser(actor, event.request.headers, event.params.id, label, reason),
		);
	},

	unban: (event) =>
		userAction(event, "Failed to unban user", (actor, label) =>
			adminService.unbanUser(actor, event.request.headers, event.params.id, label),
		),

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

	revokeAllSessions: (event) =>
		userAction(event, "Failed to revoke sessions", (actor, label) =>
			adminService.revokeAllUserSessions(actor, event.request.headers, event.params.id, label),
		),

	impersonate: (event) =>
		userAction(
			event,
			"Failed to impersonate user",
			(actor, label) =>
				adminService.impersonateUser(actor, event.request.headers, event.params.id, label),
			"/dashboard",
		),
};
