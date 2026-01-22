import { statusPageService } from "$lib/server/services/status-page.service";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		return { statusPages: [] };
	}

	const statusPages = await statusPageService.findByOrganization(
		locals.session.activeOrganizationId,
	);

	return { statusPages };
};
