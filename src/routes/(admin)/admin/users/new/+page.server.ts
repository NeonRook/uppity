import { createUserSchema } from "$lib/schemas/admin";
import { auth } from "$lib/server/auth";
import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const form = await superValidate(valibot(createUserSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, valibot(createUserSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await auth.api.createUser({
				headers: request.headers,
				body: {
					email: form.data.email,
					password: form.data.password,
					name: form.data.name,
					role: form.data.role || "user",
				},
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to create user";
			return fail(400, { form, message });
		}

		return redirect(302, "/admin/users");
	},
};
