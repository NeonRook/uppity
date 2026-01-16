import { deleteIncidentSchema } from "$lib/schemas/incident";
import { incidentService } from "$lib/server/services/incident.service";
import { fail } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.session?.activeOrganizationId) {
		return { incidents: [] };
	}

	const includeResolved = url.searchParams.get("resolved") === "true";

	const incidents = await incidentService.findByOrganization(locals.session.activeOrganizationId, {
		includeResolved,
	});

	return { incidents, includeResolved };
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(deleteIncidentSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const deleted = await incidentService.delete(
			form.data.incidentId,
			locals.session.activeOrganizationId,
		);

		if (!deleted) {
			return message(form, "Incident not found", { status: 404 });
		}

		return message(form, "Incident deleted");
	},
};
