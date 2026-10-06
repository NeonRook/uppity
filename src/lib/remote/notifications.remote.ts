import { command, query } from "$app/server";
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
		throw new Error("Channel not found");
	}

	return { success: true, enabled: updated.enabled };
});

export const deleteChannel = command(channelIdSchema, async ({ channelId }) => {
	const organizationId = requireOrganizationId();

	const deleted = await notificationChannelService.delete(channelId, organizationId);

	if (!deleted) {
		throw new Error("Channel not found");
	}

	return { success: true };
});
