import { command, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import { maintenanceErrorMessage } from "$lib/server/maintenance-messages";
import { MaintenanceWindowService } from "$lib/server/services/maintenance-window.service";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

const windowIdSchema = v.object({
	windowId: v.pipe(v.string(), v.minLength(1)),
});

/**
 * `MaintenanceWindowService` is deliberately not a singleton — it is constructed per
 * call so the monitor worker can bundle it without dragging in a module-level `db`.
 */
function service() {
	return new MaintenanceWindowService(db);
}

/**
 * Rejections travel as `error()` rather than a bare `throw new Error()`.
 *
 * SvelteKit masks unexpected thrown errors as "Internal Error" in production, so a
 * bare throw would strip the translated reason the operator needs ("Only a window
 * that has not started can be deleted"). An HttpError keeps its message across the
 * wire, which is the whole point of translating it.
 */
function reject(err: unknown): never {
	error(400, maintenanceErrorMessage(err));
}

/**
 * End a window early. Alerting on the affected monitors resumes immediately.
 * Legal while `scheduled` or `in_progress`; the service rejects a completed window.
 */
export const cancelMaintenanceWindow = command(windowIdSchema, async ({ windowId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		error(401, "Not authenticated");
	}

	try {
		await service().cancel(windowId, locals.session.activeOrganizationId);
	} catch (err) {
		reject(err);
	}

	return { success: true };
});

/**
 * Remove a window outright. The service permits this only while it is still
 * `scheduled`, so nothing that ever suppressed an alert can be erased.
 */
export const deleteMaintenanceWindow = command(windowIdSchema, async ({ windowId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		error(401, "Not authenticated");
	}

	try {
		await service().delete(windowId, locals.session.activeOrganizationId);
	} catch (err) {
		reject(err);
	}

	return { success: true };
});
