import { fail, redirect, error } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import { notificationChannelSchema } from "#lib/schemas/notification-channel.js";
import { buildChannelConfig } from "#lib/server/notification-config.js";
import { notificationChannelService } from "#lib/server/services/notification-channel.service.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const channel = await notificationChannelService.findByIdAndOrg(
		params.id,
		locals.session.activeOrganizationId,
	);

	if (!channel) {
		error(404, "Notification channel not found");
	}

	// Extract config values based on type
	const config = channel.config as Record<string, unknown>;
	const initialData: Record<string, unknown> = {
		name: channel.name,
		type: channel.type,
	};

	switch (channel.type) {
		case "email":
			initialData.email = config.email;
			break;
		case "slack":
			initialData.webhookUrl = config.webhookUrl;
			initialData.channel = config.channel;
			break;
		case "discord":
			initialData.discordWebhookUrl = config.discordWebhookUrl;
			break;
		case "webhook":
			initialData.url = config.url;
			initialData.method = config.method ?? "POST";
			initialData.headers = config.headers ? JSON.stringify(config.headers, null, 2) : undefined;
			initialData.bodyTemplate = config.bodyTemplate;
			break;
	}

	const form = await superValidate(initialData, valibot(notificationChannelSchema));

	return { channel, form };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(notificationChannelSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { data } = form;

		const config = buildChannelConfig(data);
		if (!config) {
			return message(form, "Invalid headers JSON", { status: 400 });
		}

		// Enrich wide event with action context
		locals.event.merge({
			action: "update_notification_channel",
			resource_type: "notification_channel",
			resource_id: params.id,
		});

		try {
			await notificationChannelService.update(params.id, locals.session.activeOrganizationId, {
				name: data.name,
				config,
			});
		} catch (err) {
			locals.event.setError(err);
			return message(form, "Failed to update notification channel", { status: 500 });
		}

		return redirect(302, "/notifications");
	},
};
