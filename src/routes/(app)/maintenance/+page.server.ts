import { db } from "$lib/server/db";
import { MaintenanceWindowService } from "$lib/server/services/maintenance-window.service";
import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}
	const orgId = locals.session.activeOrganizationId;
	const windows = await new MaintenanceWindowService(db).listByOrg(orgId);
	return {
		upcoming: windows.filter((w) => w.status === "scheduled"),
		active: windows.filter((w) => w.status === "in_progress"),
		past: windows.filter((w) => w.status === "completed" || w.status === "cancelled"),
	};
};
