import { m } from "$lib/paraglide/messages.js";
import { MaintenanceWindowError } from "$lib/server/services/maintenance-window.service";

/**
 * Translate a maintenance-window rejection into copy a form can show.
 *
 * Lives in the route layer rather than the service because the service is bundled
 * into the monitor worker, which has no locale. Anything that is not a recognised
 * `MaintenanceWindowError` gets the generic message: an unexpected failure must not
 * leak a stack-shaped English string into the UI just because it reached a catch.
 */
export function maintenanceErrorMessage(err: unknown): string {
	if (!(err instanceof MaintenanceWindowError)) {
		return m.maintenance_error_unexpected();
	}

	switch (err.code) {
		case "not_found":
			return m.maintenance_error_not_found();
		case "name_required":
			return m.maintenance_error_name_required();
		case "end_before_start":
			return m.maintenance_error_end_before_start();
		case "end_in_past":
			return m.maintenance_error_end_in_past();
		case "no_monitors":
			return m.maintenance_error_no_monitors();
		case "monitor_not_found":
			return m.maintenance_error_monitor_not_found();
		case "cannot_cancel_completed":
			return m.maintenance_error_cannot_cancel_completed();
		case "not_deletable":
			return m.maintenance_error_not_deletable();
		default:
			return m.maintenance_error_unexpected();
	}
}
