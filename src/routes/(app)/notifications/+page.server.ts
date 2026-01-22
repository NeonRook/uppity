import { notificationChannelService } from "$lib/server/services/notification-channel.service";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		return { channels: [] };
	}

	const channels = await notificationChannelService.findByOrganization(
		locals.session.activeOrganizationId,
	);

	return { channels };
};
