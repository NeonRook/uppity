import { deleteStatusPageSchema } from "$lib/schemas/status-page";
import { statusPageService } from "$lib/server/services/status-page.service";
import { fail } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		return { statusPages: [] };
	}

	const statusPages = await statusPageService.findByOrganization(
		locals.session.activeOrganizationId,
	);

	return { statusPages };
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(deleteStatusPageSchema));

		if (!form.valid) {
			return fail(400, { error: "Status page ID is required" });
		}

		const deleted = await statusPageService.delete(
			form.data.statusPageId,
			locals.session.activeOrganizationId,
		);

		if (!deleted) {
			return fail(404, { error: "Status page not found" });
		}

		return { success: true };
	},
};
