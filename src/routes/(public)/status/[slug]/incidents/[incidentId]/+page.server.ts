import { statusPageService } from "$lib/server/services/status-page.service";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const data = await statusPageService.getPublicIncident(params.slug, params.incidentId);

	if (!data) {
		error(404, "Incident not found");
	}

	return data;
};
