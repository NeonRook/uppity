import { m } from "#lib/paraglide/messages.js";
import { MaintenanceWindowError } from "#lib/server/services/maintenance-window.service.js";

const MESSAGES: Record<MaintenanceWindowError["code"], () => string> = {
	not_found: m.maintenance_error_not_found,
	name_required: m.maintenance_error_name_required,
	end_before_start: m.maintenance_error_end_before_start,
	end_in_past: m.maintenance_error_end_in_past,
	no_monitors: m.maintenance_error_no_monitors,
	monitor_not_found: m.maintenance_error_monitor_not_found,
	cannot_cancel_completed: m.maintenance_error_cannot_cancel_completed,
	not_deletable: m.maintenance_error_not_deletable,
};

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
	return (MESSAGES[err.code] ?? m.maintenance_error_unexpected)();
}
