import { db } from "$lib/server/db";
import {
	MaintenanceWindowService,
	type MaintenanceWindowSummary,
} from "$lib/server/services/maintenance-window.service";
import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

/**
 * `listByOrg` returns newest-start-first, which is right for windows that have
 * already happened and wrong for ones that have not: it puts the window three months
 * out above the one starting within the hour. Upcoming is therefore re-sorted
 * ascending, so the section reads in the order the operator will live through it.
 */
function bySoonestFirst(windows: MaintenanceWindowSummary[]): MaintenanceWindowSummary[] {
	return windows.toSorted(
		(a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
	);
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}
	const orgId = locals.session.activeOrganizationId;
	const windows = await new MaintenanceWindowService(db).listByOrg(orgId);
	return {
		upcoming: bySoonestFirst(windows.filter((w) => w.status === "scheduled")),
		active: windows.filter((w) => w.status === "in_progress"),
		past: windows.filter((w) => w.status === "completed" || w.status === "cancelled"),
	};
};
