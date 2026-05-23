import { updateMaintenanceWindowSchema } from "$lib/schemas/maintenance-window";
import { db } from "$lib/server/db";
import { monitor } from "$lib/server/db/schema";
import { MaintenanceWindowService } from "$lib/server/services/maintenance-window.service";
import { error, fail, redirect } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { message, superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}
	const orgId = locals.session.activeOrganizationId;
	const window = await new MaintenanceWindowService(db).findById(params.id, orgId);
	if (!window) error(404, "Maintenance window not found");
	const monitors = await db
		.select({ id: monitor.id, name: monitor.name })
		.from(monitor)
		.where(eq(monitor.organizationId, orgId))
		.orderBy(asc(monitor.name));
	const form = await superValidate(
		{
			name: window.name,
			description: window.description ?? undefined,
			startsAt: window.startsAt,
			endsAt: window.endsAt,
			monitorIds: window.monitorIds,
		},
		valibot(updateMaintenanceWindowSchema),
	);
	return { form, monitors, window };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}
		const orgId = locals.session.activeOrganizationId;
		const form = await superValidate(request, valibot(updateMaintenanceWindowSchema));
		if (!form.valid) return fail(400, { form });
		try {
			await new MaintenanceWindowService(db).update(params.id, orgId, form.data);
			return message(form, { type: "success" as const });
		} catch (err) {
			if (err instanceof Error) {
				return message(form, { type: "error" as const, text: err.message }, { status: 400 });
			}
			throw err;
		}
	},
	cancel: async ({ params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}
		const orgId = locals.session.activeOrganizationId;
		await new MaintenanceWindowService(db).cancel(params.id, orgId);
		return redirect(303, "/maintenance");
	},
};
