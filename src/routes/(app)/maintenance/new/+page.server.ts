import { createMaintenanceWindowSchema } from "$lib/schemas/maintenance-window";
import { db } from "$lib/server/db";
import { monitor } from "$lib/server/db/schema";
import { maintenanceErrorMessage } from "$lib/server/maintenance-messages";
import { MaintenanceWindowService } from "$lib/server/services/maintenance-window.service";
import { fail, redirect } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { message, superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}
	const orgId = locals.session.activeOrganizationId;
	const monitors = await db
		.select({ id: monitor.id, name: monitor.name })
		.from(monitor)
		.where(eq(monitor.organizationId, orgId))
		.orderBy(asc(monitor.name));
	const form = await superValidate(valibot(createMaintenanceWindowSchema));
	return { form, monitors };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}
		const form = await superValidate(request, valibot(createMaintenanceWindowSchema));
		if (!form.valid) return fail(400, { form });
		let created;
		try {
			created = await new MaintenanceWindowService(db).create({
				organizationId: locals.session.activeOrganizationId,
				createdBy: locals.user?.id,
				name: form.data.name,
				description: form.data.description,
				startsAt: form.data.startsAt,
				endsAt: form.data.endsAt,
				monitorIds: form.data.monitorIds,
			});
		} catch (err) {
			return message(form, maintenanceErrorMessage(err), { status: 400 });
		}
		return redirect(303, `/maintenance/${created.id}`);
	},
};
