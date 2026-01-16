import type { IncidentStatus, IncidentImpact } from "$lib/server/services/incident.service";

import {
	updateIncidentSchema,
	addIncidentUpdateSchema,
	incidentImpactValues,
} from "$lib/schemas/incident";
import { incidentService } from "$lib/server/services/incident.service";
import { fail, redirect, error } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const incident = await incidentService.findWithDetails(
		params.id,
		locals.session.activeOrganizationId,
	);

	if (!incident) {
		error(404, "Incident not found");
	}

	const updateForm = await superValidate(
		{ title: incident.title, impact: incident.impact as (typeof incidentImpactValues)[number] },
		valibot(updateIncidentSchema),
	);
	const addUpdateForm = await superValidate(valibot(addIncidentUpdateSchema));

	return { incident, updateForm, addUpdateForm };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(updateIncidentSchema));

		if (!form.valid) {
			return fail(400, { updateForm: form });
		}

		await incidentService.update(params.id, locals.session.activeOrganizationId, {
			title: form.data.title,
			impact: form.data.impact as IncidentImpact,
		});

		return message(form, "Incident updated");
	},

	addUpdate: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(addIncidentUpdateSchema));

		if (!form.valid) {
			return fail(400, { addUpdateForm: form });
		}

		await incidentService.addUpdate({
			incidentId: params.id,
			status: form.data.status as IncidentStatus,
			message: form.data.message,
			createdBy: locals.user?.id,
		});

		return message(form, "Update added");
	},

	delete: async ({ params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		await incidentService.delete(params.id, locals.session.activeOrganizationId);

		redirect(302, "/incidents");
	},
};
