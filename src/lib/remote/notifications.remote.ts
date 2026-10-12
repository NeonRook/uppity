import { command, query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { getActiveOrganizationId, requireOrganizationId } from "#lib/remote/organization.js";
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
