import { sendChannelUnsubscribedNotice } from "#lib/server/account-email.js";
import { db } from "#lib/server/db/index.js";
import { logger } from "#lib/server/logger/index.js";
import { noticeRecipients } from "#lib/server/services/capacity.service.js";
import { emailChannelService } from "#lib/server/services/email-channel.instance.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => ({
	recipient: await emailChannelService.lookup(params.token),
});

// Unsubscribing waits for a POST: mail scanners follow links, and a GET would unsubscribe for them.
export const actions: Actions = {
	default: async ({ params }) => {
		const stopped = await emailChannelService.unsubscribe(params.token);
		if (!stopped) return;

		// A shared address can silence a whole team, so its admins hear about it.
		try {
			await sendChannelUnsubscribedNotice(
				await noticeRecipients(db, stopped.organizationId),
				stopped,
			);
		} catch (error) {
			logger.error(
				{ organization_id: stopped.organizationId, error },
				"Failed to send channel unsubscribe notice",
			);
		}
	},
};
