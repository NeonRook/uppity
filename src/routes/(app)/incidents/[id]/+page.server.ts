import type { IncidentImpact, IncidentStatus } from "$lib/constants/status";

import {
	updateIncidentSchema,
	addIncidentUpdateSchema,
	addPostmortemSchema,
	editPostmortemSchema,
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
		{ title: incident.title, impact: incident.impact as IncidentImpact },
		valibot(updateIncidentSchema),
	);
	const addUpdateForm = await superValidate(valibot(addIncidentUpdateSchema));
	const postmortemForm = await superValidate(valibot(addPostmortemSchema));

	// Check if incident already has a postmortem
	const existingPostmortem = incident.updates.find((u) => u.status === "postmortem");
	const editPostmortemForm = await superValidate(
		existingPostmortem
			? { updateId: existingPostmortem.id, message: existingPostmortem.message }
			: { updateId: "", message: "" },
		valibot(editPostmortemSchema),
	);

	return { incident, updateForm, addUpdateForm, postmortemForm, editPostmortemForm };
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
			impact: form.data.impact,
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

	addPostmortem: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(addPostmortemSchema));

		if (!form.valid) {
			return fail(400, { postmortemForm: form });
		}

		// Verify incident exists and is resolved
		const incident = await incidentService.findByIdAndOrg(
			params.id,
			locals.session.activeOrganizationId,
		);

		if (!incident) {
			return fail(404, { error: "Incident not found" });
		}

		if (incident.status !== "resolved") {
			return message(form, "Postmortem can only be added to resolved incidents", {
				status: 400,
			});
		}

		// Check if postmortem already exists
		const updates = await incidentService.getUpdates(params.id);
		if (updates.some((u) => u.status === "postmortem")) {
			return message(form, "This incident already has a postmortem", {
				status: 400,
			});
		}

		await incidentService.addUpdate({
			incidentId: params.id,
			status: "postmortem",
			message: form.data.message,
			createdBy: locals.user?.id,
		});

		return message(form, "Postmortem added");
	},

	editPostmortem: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(editPostmortemSchema));

		if (!form.valid) {
			return fail(400, { editPostmortemForm: form });
		}

		// Verify incident exists and is resolved
		const incident = await incidentService.findByIdAndOrg(
			params.id,
			locals.session.activeOrganizationId,
		);

		if (!incident) {
			return fail(404, { error: "Incident not found" });
		}

		if (incident.status !== "resolved") {
			return message(form, "Postmortem can only be edited on resolved incidents", {
				status: 400,
			});
		}

		// Update the postmortem
		const updated = await incidentService.updateIncidentUpdate(
			form.data.updateId,
			form.data.message,
		);

		if (!updated) {
			return message(form, "Postmortem not found", { status: 404 });
		}

		return message(form, "Postmortem updated");
	},

	delete: async ({ params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		await incidentService.delete(params.id, locals.session.activeOrganizationId);

		redirect(302, "/incidents");
	},
};
