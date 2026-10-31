import {
	announceUnsubscribe,
	emailChannelService,
} from "#lib/server/services/email-channel.instance.js";

import type { Actions } from "./$types";

// Unsubscribing waits for a POST: mail scanners follow links, and a GET would unsubscribe for them.
export const actions: Actions = {
	default: async ({ params }) => {
		const stopped = await emailChannelService.unsubscribeInvitation(params.id);
		if (stopped) await announceUnsubscribe(stopped);
		return { done: true };
	},
};
