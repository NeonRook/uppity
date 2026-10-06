import { fail, redirect, error } from "@sveltejs/kit";
import { superValidate, message, type SuperValidated } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { IncidentImpact } from "#lib/constants/status.js";
import {
	updateIncidentSchema,
	addIncidentUpdateSchema,
	addPostmortemSchema,
	editPostmortemSchema,
} from "#lib/schemas/incident.js";
import { incidentService } from "#lib/server/services/incident.service.js";

import type { Actions, PageServerLoad } from "./$types";

/** Fails the action unless the incident exists in the organization and is resolved. */
async function requireResolved<T extends Record<string, unknown>>(
	id: string,
	organizationId: string,
	form: SuperValidated<T>,
	notResolvedMessage: string,
) {
	const incident = await incidentService.findByIdAndOrg(id, organizationId);

	if (!incident) {
		return fail(404, { error: "Incident not found" });
	}

	if (incident.status !== "resolved") {
		return message(form, notResolvedMessage, { status: 400 });
	}

	return null;
}

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

		const updated = await incidentService.update(params.id, locals.session.activeOrganizationId, {
			title: form.data.title,
			impact: form.data.impact,
		});

		if (!updated) {
			return message(form, "Incident not found", { status: 404 });
		}

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

		const update = await incidentService.addUpdate({
			incidentId: params.id,
			organizationId: locals.session.activeOrganizationId,
			status: form.data.status,
			message: form.data.message,
			createdBy: locals.user?.id,
		});

		if (!update) {
			return message(form, "Incident not found", { status: 404 });
		}

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

		const unresolved = await requireResolved(
			params.id,
			locals.session.activeOrganizationId,
			form,
			"Postmortem can only be added to resolved incidents",
		);
		if (unresolved) return unresolved;

		// Check if postmortem already exists
		const updates = await incidentService.getUpdates(params.id);
		if (updates.some((u) => u.status === "postmortem")) {
			return message(form, "This incident already has a postmortem", {
				status: 400,
			});
		}

		await incidentService.addUpdate({
			incidentId: params.id,
			organizationId: locals.session.activeOrganizationId,
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

		const unresolved = await requireResolved(
			params.id,
			locals.session.activeOrganizationId,
			form,
			"Postmortem can only be edited on resolved incidents",
		);
		if (unresolved) return unresolved;

		const updated = await incidentService.updatePostmortem(
			params.id,
			locals.session.activeOrganizationId,
			form.data.updateId,
			form.data.message,
		);

		if (!updated) {
			return message(form, "Postmortem not found", { status: 404 });
		}

		return message(form, "Postmortem updated");
	},
};
