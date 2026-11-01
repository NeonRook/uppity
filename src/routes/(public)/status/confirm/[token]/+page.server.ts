import { error } from "@sveltejs/kit";

import { m } from "#lib/paraglide/messages.js";
import { statusPageSubscriberService } from "#lib/server/services/status-page-subscriber.instance.js";
import { statusPageService } from "#lib/server/services/status-page.service.js";

import type { Actions, PageServerLoad } from "./$types";

async function pageOf(token: string) {
	const id = await statusPageSubscriberService.pageIdFor(token);
	const page = id ? await statusPageService.findById(id) : null;
	if (!page?.isPublic) error(404, m.public_confirm_invalid());
	return page;
}

export const load: PageServerLoad = async ({ params }) => {
	const page = await pageOf(params.token);

	const { name, slug, description, logoUrl, faviconUrl } = page;
	return {
		page: { name, slug, description, logoUrl, faviconUrl },
		state: await statusPageSubscriberService.lookup(page.id, params.token),
	};
};

// Confirmation waits for a POST: mail scanners follow links, and a GET would opt in for them.
export const actions: Actions = {
	default: async ({ params }) => {
		const page = await pageOf(params.token);
		await statusPageSubscriberService.confirm(page.id, params.token);
	},
};
