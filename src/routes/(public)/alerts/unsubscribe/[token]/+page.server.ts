import {
	announceUnsubscribe,
	emailChannelService,
} from "#lib/server/services/email-channel.instance.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => ({
	recipient: await emailChannelService.lookup(params.token),
});

// Unsubscribing waits for a POST: mail scanners follow links, and a GET would unsubscribe for them.
export const actions: Actions = {
	default: async ({ params }) => {
		const stopped = await emailChannelService.unsubscribe(params.token);
		if (stopped) await announceUnsubscribe(stopped);
	},
};
