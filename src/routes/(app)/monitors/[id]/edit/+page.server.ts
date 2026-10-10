import { error, fail, redirect } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import { createMonitorSchema } from "#lib/schemas/monitor.js";
import { db } from "#lib/server/db/index.js";
import { SubscriptionLimitError } from "#lib/server/errors.js";
import { toMonitorInput } from "#lib/server/monitor-input.js";
import { MonitorChannelService } from "#lib/server/services/monitor-channel.service.js";
import { monitorService } from "#lib/server/services/monitor.service.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const organizationId = locals.session.activeOrganizationId;
	const monitor = await monitorService.findByIdAndOrg(params.id, organizationId);

	if (!monitor) {
		error(404, "Monitor not found");
	}

	// Prepare form data based on monitor type
	const baseFormData = {
		name: monitor.name,
		description: monitor.description ?? undefined,
		intervalSeconds: monitor.intervalSeconds,
		timeoutSeconds: monitor.timeoutSeconds,
		retries: monitor.retries,
		alertAfterFailures: monitor.alertAfterFailures,
		channels: await new MonitorChannelService(db).list(monitor.id, organizationId),
	};

	let formData;
	switch (monitor.type) {
		case "http":
			formData = {
				...baseFormData,
				type: "http" as const,
				url: monitor.url ?? "",
				method: (monitor.method ?? "GET") as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD",
				sslCheckEnabled: monitor.sslCheckEnabled ?? false,
			};
			break;
		case "tcp":
			formData = {
				...baseFormData,
				type: "tcp" as const,
				hostname: monitor.hostname ?? "",
				port: monitor.port ?? 443,
			};
			break;
		case "push":
			formData = {
				...baseFormData,
				type: "push" as const,
				pushGracePeriodSeconds: monitor.pushGracePeriodSeconds ?? 60,
			};
			break;
	}

	const form = await superValidate(formData, valibot(createMonitorSchema));

	const channels = await new MonitorChannelService(db).options(organizationId);
	return { form, monitor, channels };
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(createMonitorSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const { data } = form;

		// Enrich wide event with action context
		locals.event.merge({
			action: "update_monitor",
			resource_type: "monitor",
			resource_id: params.id,
		});

		try {
			const updated = await monitorService.update(
				params.id,
				locals.session.activeOrganizationId,
				toMonitorInput(data),
			);

			if (!updated) {
				return message(form, "Monitor not found", { status: 404 });
			}

			const linked = await new MonitorChannelService(db).replace(
				params.id,
				locals.session.activeOrganizationId,
				data.channels,
			);
			if (!linked) {
				return message(form, "Notification channel not found", { status: 400 });
			}
		} catch (err) {
			if (err instanceof SubscriptionLimitError) {
				return message(form, err.message, { status: 403 });
			}
			locals.event.setError(err);
			return message(form, "Failed to update monitor", { status: 500 });
		}

		return redirect(302, `/monitors/${params.id}`);
	},
};
