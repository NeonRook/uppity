import { updateUserSchema } from "$lib/schemas/admin";
import { auth } from "$lib/server/auth";
import { db } from "$lib/server/db";
import { user } from "$lib/server/db/auth-schema";
import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

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

	return { user: foundUser, form };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const form = await superValidate(request, valibot(updateUserSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Update user info via direct DB query (admin updateUser doesn't support userId)
			const updateData: Partial<typeof user.$inferInsert> = {};
			if (form.data.name) updateData.name = form.data.name;
			if (form.data.email) updateData.email = form.data.email;

			if (Object.keys(updateData).length > 0) {
				await db.update(user).set(updateData).where(eq(user.id, params.id));
			}

			// Update role if changed
			if (form.data.role) {
				await auth.api.setRole({
					headers: request.headers,
					body: {
						userId: params.id,
						role: form.data.role,
					},
				});
			}

			return { form, success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to update user";
			return fail(400, { form, message });
		}
	},

	ban: async ({ request, params }) => {
		const formData = await request.formData();
		const banReasonValue = formData.get("banReason");
		const reason =
			typeof banReasonValue === "string" && banReasonValue ? banReasonValue : undefined;

		try {
			await auth.api.banUser({
				headers: request.headers,
				body: {
					userId: params.id,
					...(reason && { banReason: reason }),
				},
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to ban user";
			return fail(400, { message });
		}

		return redirect(302, `/admin/users/${params.id}`);
	},

	unban: async ({ request, params }) => {
		try {
			await auth.api.unbanUser({
				headers: request.headers,
				body: {
					userId: params.id,
				},
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to unban user";
			return fail(400, { message });
		}

		return redirect(302, `/admin/users/${params.id}`);
	},
};
