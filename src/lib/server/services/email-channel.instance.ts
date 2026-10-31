import { sendChannelUnsubscribedNotice } from "#lib/server/account-email.js";
import { db } from "#lib/server/db/index.js";
import { logger } from "#lib/server/logger/index.js";
import { sendChannelConfirmation } from "#lib/server/notifications/email.js";

import { noticeRecipients } from "./capacity.service";
import { EmailChannelService, type UnsubscribedChannel } from "./email-channel.service";

export const emailChannelService = new EmailChannelService(db, sendChannelConfirmation);

/** A shared address can silence a whole team, so its admins hear about it. */
export async function announceUnsubscribe(stopped: UnsubscribedChannel): Promise<void> {
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
}
