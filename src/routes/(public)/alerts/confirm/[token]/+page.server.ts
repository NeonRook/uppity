import { emailChannelService } from "#lib/server/services/email-channel.instance.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => ({
	recipient: await emailChannelService.lookup(params.token),
});

// Confirmation waits for a POST: mail scanners follow links, and a GET would opt in for them.
export const actions: Actions = {
	default: async ({ params }) => {
		await emailChannelService.confirm(params.token);
	},
};
