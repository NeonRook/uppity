import { createMonitorSchema } from "$lib/schemas/monitor";
import { monitorService } from "$lib/server/services/monitor.service";
import { error, fail, redirect } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		redirect(302, "/settings");
	}

	const monitor = await monitorService.findByIdAndOrg(
		params.id,
		locals.session.activeOrganizationId,
	);

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

	return { form, monitor };
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

		try {
			const baseData = {
				name: data.name,
				description: data.description,
				type: data.type,
				intervalSeconds: data.intervalSeconds ?? 60,
				timeoutSeconds: data.timeoutSeconds ?? 30,
				retries: data.retries ?? 0,
				alertAfterFailures: data.alertAfterFailures ?? 1,
			};

			let updateData;
			switch (data.type) {
				case "http":
					updateData = {
						...baseData,
						url: data.url,
						method: data.method ?? "GET",
						sslCheckEnabled: data.sslCheckEnabled ?? false,
					};
					break;
				case "tcp":
					updateData = {
						...baseData,
						hostname: data.hostname,
						port: data.port,
					};
					break;
				case "push":
					updateData = {
						...baseData,
						pushGracePeriodSeconds: data.pushGracePeriodSeconds ?? 60,
					};
					break;
			}

			const updated = await monitorService.update(
				params.id,
				locals.session.activeOrganizationId,
				updateData,
			);

			if (!updated) {
				return message(form, "Monitor not found", { status: 404 });
			}
		} catch (err) {
			console.error("Failed to update monitor:", err);
			return message(form, "Failed to update monitor", { status: 500 });
		}

		redirect(302, `/monitors/${params.id}`);
	},
};
