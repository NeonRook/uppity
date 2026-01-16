import { toggleChannelSchema, deleteChannelSchema } from "$lib/schemas/notification-channel";
import { notificationChannelService } from "$lib/server/services/notification-channel.service";
import { fail } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		return { channels: [] };
	}

	const channels = await notificationChannelService.findByOrganization(
		locals.session.activeOrganizationId,
	);

	return { channels };
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(toggleChannelSchema));

		if (!form.valid) {
			return fail(400, { error: "Channel ID is required" });
		}

		await notificationChannelService.toggleEnabled(
			form.data.channelId,
			locals.session.activeOrganizationId,
		);
		return { success: true };
	},

	delete: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(deleteChannelSchema));

		if (!form.valid) {
			return fail(400, { error: "Channel ID is required" });
		}

		const deleted = await notificationChannelService.delete(
			form.data.channelId,
			locals.session.activeOrganizationId,
		);

		if (!deleted) {
			return fail(404, { error: "Channel not found" });
		}

		return { success: true };
	},
};
