import { createMonitorSchema } from "$lib/schemas/monitor";
import { monitorService } from "$lib/server/services/monitor.service";
import { fail, redirect } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

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
			const baseData = {
				organizationId: locals.session.activeOrganizationId,
				name: data.name,
				description: data.description,
				type: data.type,
				intervalSeconds: data.intervalSeconds ?? 60,
				timeoutSeconds: data.timeoutSeconds ?? 30,
				retries: data.retries ?? 0,
				alertAfterFailures: data.alertAfterFailures ?? 1,
			};

			switch (data.type) {
				case "http":
					monitor = await monitorService.create({
						...baseData,
						url: data.url,
						method: data.method ?? "GET",
						sslCheckEnabled: data.sslCheckEnabled ?? false,
					});
					break;
				case "tcp":
					monitor = await monitorService.create({
						...baseData,
						hostname: data.hostname,
						port: data.port,
					});
					break;
				case "push":
					monitor = await monitorService.create({
						...baseData,
						pushGracePeriodSeconds: data.pushGracePeriodSeconds ?? 60,
					});
					break;
			}

			// Set resource_id after creation
			locals.event.set("resource_id", monitor.id);
		} catch (error) {
			locals.event.setError(error);
			return message(form, "Failed to create monitor", { status: 500 });
		}

		redirect(302, `/monitors/${monitor.id}`);
	},
};
