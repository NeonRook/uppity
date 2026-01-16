import { statusPageService } from "$lib/server/services/status-page.service";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const data = await statusPageService.getPublicStatusPage(params.slug);

	if (!data) {
		error(404, "Status page not found");
	}

	return { statusData: data };
};
