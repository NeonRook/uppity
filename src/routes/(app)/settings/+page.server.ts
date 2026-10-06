import { fail } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import { generateSlug } from "#lib/format.js";
import { updateProfileSchema, createOrganizationSchema } from "#lib/schemas/settings.js";
import { auth } from "#lib/server/auth.js";

import type { Actions } from "./$types";

export const actions: Actions = {
	updateProfile: async ({ request }) => {
		const form = await superValidate(request, valibot(updateProfileSchema));

		if (!form.valid) {
			return fail(400, { error: "Name is required" });
		}

		try {
			await auth.api.updateUser({
				headers: request.headers,
				body: {
					name: form.data.name,
				},
			});
			return { success: true, profileUpdated: true };
		} catch {
			return fail(500, { error: "Failed to update profile" });
		}
	},

	createOrganization: async ({ request }) => {
		const form = await superValidate(request, valibot(createOrganizationSchema));

		if (!form.valid) {
			return fail(400, { error: "Organization name is required" });
		}

		const slug = generateSlug(form.data.name);

		try {
			await auth.api.createOrganization({
				headers: request.headers,
				body: {
					name: form.data.name,
					slug: `${slug}-${Math.random().toString(36).substring(2, 8)}`,
				},
			});
			return { success: true, orgCreated: true };
		} catch {
			return fail(500, { error: "Failed to create organization" });
		}
	},
};
