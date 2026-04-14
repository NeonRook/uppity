import { createStatusPageSchema } from "$lib/schemas/status-page";
import { SubscriptionLimitError } from "$lib/server/errors";
import { monitorService } from "$lib/server/services/monitor.service";
import { statusPageService } from "$lib/server/services/status-page.service";
import { fail, redirect } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	// Get available monitors to add to the status page
	const monitors = await monitorService.findByOrganization(locals.session.activeOrganizationId);
	const form = await superValidate(valibot(createStatusPageSchema));

	return { monitors, form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(createStatusPageSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { data } = form;

		// Enrich wide event with action context
		locals.event.merge({
			action: "create_status_page",
			resource_type: "status_page",
		});

		let statusPage;
		try {
			statusPage = await statusPageService.create({
				organizationId: locals.session.activeOrganizationId,
				name: data.name,
				slug: data.slug.toLowerCase(),
				description: data.description,
				isPublic: data.isPublic ?? false,
				logoUrl: data.logoUrl || undefined,
				primaryColor: data.primaryColor ?? "#000000",
			});

			locals.event.set("resource_id", statusPage.id);

			// Add selected monitors
			const monitorIds = data.monitors ?? [];
			for (let i = 0; i < monitorIds.length; i++) {
				await statusPageService.addMonitor({
					statusPageId: statusPage.id,
					monitorId: monitorIds[i],
					order: i,
				});
			}
		} catch (error) {
			if (error instanceof SubscriptionLimitError) {
				return message(form, error.message, { status: 403 });
			}
			if (error instanceof Error && error.message === "Slug already taken") {
				return message(form, "This slug is already taken", { status: 400 });
			}
			locals.event.setError(error);
			return message(form, "Failed to create status page", { status: 500 });
		}

		return redirect(302, `/status-pages/${statusPage.id}`);
	},
};
