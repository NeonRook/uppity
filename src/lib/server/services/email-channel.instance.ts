import { db } from "#lib/server/db/index.js";
import { sendChannelConfirmation } from "#lib/server/notifications/email.js";

import { EmailChannelService } from "./email-channel.service";

export const emailChannelService = new EmailChannelService(db, sendChannelConfirmation);
