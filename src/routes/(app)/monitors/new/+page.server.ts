import { fail, redirect } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import { createMonitorSchema } from "#lib/schemas/monitor.js";
import { SubscriptionLimitError } from "#lib/server/errors.js";
import { toMonitorInput } from "#lib/server/monitor-input.js";
import { monitorService } from "#lib/server/services/monitor.service.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const form = await superValidate({ type: "http" }, valibot(createMonitorSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(createMonitorSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { data } = form;

		// Enrich wide event with action context
		locals.event.merge({
			action: "create_monitor",
			resource_type: "monitor",
		});

		let monitor;
		try {
			monitor = await monitorService.create({
				organizationId: locals.session.activeOrganizationId,
				...toMonitorInput(data),
			});

			// Set resource_id after creation
			locals.event.set("resource_id", monitor.id);
		} catch (error) {
			if (error instanceof SubscriptionLimitError) {
				return message(form, error.message, { status: 403 });
			}
			locals.event.setError(error);
			return message(form, "Failed to create monitor", { status: 500 });
		}

		return redirect(302, `/monitors/${monitor.id}`);
	},
};
