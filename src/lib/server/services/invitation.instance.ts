import { db } from "#lib/server/db/index.js";
import { subscriberTransport } from "#lib/server/smtp.js";
import { sendTeamInvitation } from "#lib/server/subscriber-email.js";

import { emailChannelService } from "./email-channel.instance";
import { InvitationService } from "./invitation.service";

export const invitationService = new InvitationService(
	db,
	emailChannelService,
	subscriberTransport ? sendTeamInvitation : null,
);
