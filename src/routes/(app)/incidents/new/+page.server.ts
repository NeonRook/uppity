import type { IncidentStatus } from "$lib/constants/status";

import { createIncidentSchema } from "$lib/schemas/incident";
import { incidentService } from "$lib/server/services/incident.service";
import { monitorService } from "$lib/server/services/monitor.service";
import { fail, redirect } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const monitors = await monitorService.findByOrganization(locals.session.activeOrganizationId);
	const form = await superValidate(valibot(createIncidentSchema));

	return { monitors, form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(createIncidentSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { data } = form;

		// Enrich wide event with action context
		locals.event.merge({
			action: "create_incident",
			resource_type: "incident",
		});

		let incident;
		try {
			incident = await incidentService.create({
				organizationId: locals.session.activeOrganizationId,
				title: data.title,
				status: data.status as IncidentStatus,
				impact: data.impact,
				message: data.message,
				monitorIds: data.monitors ?? [],
				createdBy: locals.user?.id,
			});
			locals.event.set("resource_id", incident.id);
		} catch (error) {
			locals.event.setError(error);
			return message(form, "Failed to create incident", { status: 500 });
		}

		redirect(302, `/incidents/${incident.id}`);
	},
};
