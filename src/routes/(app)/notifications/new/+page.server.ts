import { notificationChannelSchema } from "$lib/schemas/notification-channel";
import { FeatureNotAvailableError } from "$lib/server/errors";
import { notificationChannelService } from "$lib/server/services/notification-channel.service";
import { fail, redirect } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const form = await superValidate(valibot(notificationChannelSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(notificationChannelSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { data } = form;

		// Build config based on type
		let config: Record<string, unknown> = {};

		switch (data.type) {
			case "email":
				config = { email: data.email };
				break;
			case "slack":
				config = { webhookUrl: data.webhookUrl, channel: data.channel };
				break;
			case "discord":
				config = { discordWebhookUrl: data.discordWebhookUrl };
				break;
			case "webhook": {
				let headers: Record<string, string> | undefined;
				if (data.headers) {
					try {
						headers = JSON.parse(data.headers);
					} catch {
						return message(form, "Invalid headers JSON", { status: 400 });
					}
				}
				config = {
					url: data.url,
					method: data.method,
					headers,
					bodyTemplate: data.bodyTemplate,
				};
				break;
			}
		}

		// Enrich wide event with action context
		locals.event.merge({
			action: "create_notification_channel",
			resource_type: "notification_channel",
		});

		try {
			const channel = await notificationChannelService.create({
				organizationId: locals.session.activeOrganizationId,
				name: data.name,
				type: data.type,
				config,
				enabled: true,
			});
			locals.event.set("resource_id", channel.id);
		} catch (error) {
			if (error instanceof FeatureNotAvailableError) {
				return message(form, error.message, { status: 403 });
			}
			locals.event.setError(error);
			return message(form, "Failed to create notification channel", { status: 500 });
		}

		redirect(302, "/notifications");
	},
};
