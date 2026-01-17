import { createOrganizationSchema } from "$lib/schemas/admin";
import { adminService } from "$lib/server/services/admin.service";
import { fail, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const form = await superValidate(valibot(createOrganizationSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, valibot(createOrganizationSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await adminService.createOrganization({
				name: form.data.name,
				slug: form.data.slug,
				logo: form.data.logo || null,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to create organization";
			return fail(400, { form, message });
		}

		redirect(302, "/admin/organizations");
	},
};
