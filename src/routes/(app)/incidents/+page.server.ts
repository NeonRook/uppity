import { incidentService } from "$lib/server/services/incident.service";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.session?.activeOrganizationId) {
		return { incidents: [] };
	}

	const includeResolved = url.searchParams.get("resolved") === "true";

	const incidents = await incidentService.findByOrganization(locals.session.activeOrganizationId, {
		includeResolved,
	});

	return { incidents, includeResolved };
};
