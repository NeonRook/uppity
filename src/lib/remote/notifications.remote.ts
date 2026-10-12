import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { getActiveOrganizationId, requireOrganizationId } from "#lib/remote/organization.js";
import { emailChannelService } from "#lib/server/services/email-channel.instance.js";
import { notificationChannelService } from "#lib/server/services/notification-channel.service.js";

// Query: List notification channels for the current organization
export const getChannels = query(async () => {
	const organizationId = getActiveOrganizationId();
	if (!organizationId) return [];

	return notificationChannelService.findByOrganization(organizationId);
});

const channelIdSchema = v.object({
	channelId: v.pipe(v.string(), v.minLength(1)),
});

export const toggleChannel = command(channelIdSchema, async ({ channelId }) => {
	const organizationId = requireOrganizationId();

	const updated = await notificationChannelService.toggleEnabled(channelId, organizationId);

	if (!updated) {
		error(404, "Channel not found");
	}

	void getChannels().refresh();

	return { success: true, enabled: updated.enabled };
});

export const deleteChannel = command(channelIdSchema, async ({ channelId }) => {
	const organizationId = requireOrganizationId();

	const deleted = await notificationChannelService.delete(channelId, organizationId);

	if (!deleted) {
		error(404, "Channel not found");
	}

	void getChannels().refresh();

	return { success: true };
});

export const resendConfirmation = command(channelIdSchema, async ({ channelId }) => {
	const organizationId = requireOrganizationId();

	const { user } = getRequestEvent().locals;
	if (!user) error(401, "Not authenticated");

	const result = await emailChannelService.requestConfirmation(channelId, organizationId, user);

	if (!result) {
		error(404, "Channel not found");
	}

	void getChannels().refresh();

	return { result };
});
