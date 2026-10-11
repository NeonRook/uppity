import { error } from "@sveltejs/kit";

import { statusPageSubscriberService } from "#lib/server/services/status-page-subscriber.instance.js";
import { statusPageService } from "#lib/server/services/status-page.service.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const page = await statusPageService.findBySlug(params.slug);
	if (!page) error(404, "Status page not found");

	const { name, slug, description, logoUrl, faviconUrl } = page;
	return {
		page: { name, slug, description, logoUrl, faviconUrl },
		subscribed: (await statusPageSubscriberService.lookup(page.id, params.token)) !== null,
	};
};

// Unsubscribing waits for a POST: mail scanners follow links, and a GET would unsubscribe for them.
export const actions: Actions = {
	default: async ({ params }) => {
		const page = await statusPageService.findBySlug(params.slug);
		if (!page) error(404, "Status page not found");
		await statusPageSubscriberService.unsubscribe(page.id, params.token);
	},
};
