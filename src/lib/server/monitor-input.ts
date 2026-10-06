import type { CreateMonitorForm } from "#lib/schemas/monitor.js";
import type { CreateMonitorInput } from "#lib/server/services/monitor.service.js";

/** Maps validated form data to the monitor fields its type owns. */
export function toMonitorInput(
	data: CreateMonitorForm,
): Omit<CreateMonitorInput, "organizationId"> {
	const base = {
		name: data.name,
		description: data.description,
		type: data.type,
		intervalSeconds: data.intervalSeconds ?? 60,
		timeoutSeconds: data.timeoutSeconds ?? 30,
		retries: data.retries ?? 0,
		alertAfterFailures: data.alertAfterFailures ?? 1,
	};

	switch (data.type) {
		case "http":
			return {
				...base,
				url: data.url,
				method: data.method ?? "GET",
				sslCheckEnabled: data.sslCheckEnabled ?? false,
			};
		case "tcp":
			return { ...base, hostname: data.hostname, port: data.port };
		default:
			return { ...base, pushGracePeriodSeconds: data.pushGracePeriodSeconds ?? 60 };
	}
}
