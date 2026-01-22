import { command, query, getRequestEvent } from "$app/server";
import { notificationChannelService } from "$lib/server/services/notification-channel.service";
import * as v from "valibot";

// Query: List notification channels for the current organization
export const getChannels = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		return [];
	}

	return notificationChannelService.findByOrganization(locals.session.activeOrganizationId);
});

const channelIdSchema = v.object({
	channelId: v.pipe(v.string(), v.minLength(1)),
});

export const toggleChannel = command(channelIdSchema, async ({ channelId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	const updated = await notificationChannelService.toggleEnabled(
		channelId,
		locals.session.activeOrganizationId,
	);

	if (!updated) {
		throw new Error("Channel not found");
	}

	return { success: true, enabled: updated.enabled };
});

export const deleteChannel = command(channelIdSchema, async ({ channelId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	const deleted = await notificationChannelService.delete(
		channelId,
		locals.session.activeOrganizationId,
	);

	if (!deleted) {
		throw new Error("Channel not found");
	}

	return { success: true };
});
