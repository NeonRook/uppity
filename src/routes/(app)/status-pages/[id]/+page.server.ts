import { fail, redirect, error } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import {
	updateStatusPageSchema,
	addMonitorSchema,
	removeMonitorSchema,
	createGroupSchema,
	deleteGroupSchema,
} from "#lib/schemas/status-page.js";
import { FeatureNotAvailableError } from "#lib/server/errors.js";
import { monitorService } from "#lib/server/services/monitor.service.js";
import { statusPageService } from "#lib/server/services/status-page.service.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const statusPage = await statusPageService.findByIdAndOrg(
		params.id,
		locals.session.activeOrganizationId,
	);

	if (!statusPage) {
		error(404, "Status page not found");
	}

	// Get all monitors for the organization
	const allMonitors = await monitorService.findByOrganization(locals.session.activeOrganizationId);

	// Get monitors currently on this status page
	const pageMonitors = await statusPageService.getMonitors(params.id);
	const selectedMonitorIds = pageMonitors.map((pm) => pm.monitor.id);

	// Get groups
	const groups = await statusPageService.getGroups(params.id);

	// Initialize forms with current values
	const updateForm = await superValidate(
		{
			name: statusPage.name,
			slug: statusPage.slug,
			description: statusPage.description ?? undefined,
			isPublic: statusPage.isPublic,
			logoUrl: statusPage.logoUrl ?? undefined,
			primaryColor: statusPage.primaryColor ?? "#000000",
		},
		valibot(updateStatusPageSchema),
	);

	return {
		statusPage,
		allMonitors,
		selectedMonitorIds,
		groups,
		pageMonitors,
		updateForm,
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(updateStatusPageSchema));

		if (!form.valid) {
			return fail(400, { updateForm: form });
		}

		const { data } = form;

		// Enrich wide event with action context
		locals.event.merge({
			action: "update_status_page",
			resource_type: "status_page",
			resource_id: params.id,
		});

		try {
			await statusPageService.update(params.id, locals.session.activeOrganizationId, {
				name: data.name,
				slug: data.slug.toLowerCase(),
				description: data.description,
				isPublic: data.isPublic ?? false,
				logoUrl: data.logoUrl || undefined,
				primaryColor: data.primaryColor ?? "#000000",
			});

			return message(form, "Status page updated");
		} catch (err) {
			if (err instanceof FeatureNotAvailableError) {
				return message(form, err.message, { status: 403 });
			}
			if (err instanceof Error && err.message === "Slug already taken") {
				return message(form, "This slug is already taken", { status: 400 });
			}
			locals.event.setError(err);
			return message(form, "Failed to update status page", { status: 500 });
		}
	},

	addMonitor: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(addMonitorSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const added = await statusPageService.addMonitor({
			statusPageId: params.id,
			organizationId: locals.session.activeOrganizationId,
			monitorId: form.data.monitorId,
		});

		if (!added) {
			return message(form, "Monitor not found", { status: 404 });
		}

		return message(form, "Monitor added");
	},

	removeMonitor: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(removeMonitorSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const removed = await statusPageService.removeMonitor(
			params.id,
			locals.session.activeOrganizationId,
			form.data.monitorId,
		);

		if (!removed) {
			return message(form, "Monitor not found", { status: 404 });
		}

		return message(form, "Monitor removed");
	},

	createGroup: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(createGroupSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const group = await statusPageService.createGroup({
			statusPageId: params.id,
			organizationId: locals.session.activeOrganizationId,
			name: form.data.groupName,
		});

		if (!group) {
			return message(form, "Status page not found", { status: 404 });
		}

		return message(form, "Group created");
	},

	deleteGroup: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(deleteGroupSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const deleted = await statusPageService.deleteGroup(
			params.id,
			locals.session.activeOrganizationId,
			form.data.groupId,
		);

		if (!deleted) {
			return message(form, "Group not found", { status: 404 });
		}

		return message(form, "Group deleted");
	},

	delete: async ({ params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		await statusPageService.delete(params.id, locals.session.activeOrganizationId);

		return redirect(302, "/status-pages");
	},
};
