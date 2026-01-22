import { command, getRequestEvent } from "$app/server";
import { monitorService } from "$lib/server/services/monitor.service";
import * as v from "valibot";

const monitorIdSchema = v.object({
	monitorId: v.pipe(v.string(), v.minLength(1)),
});

export const toggleMonitor = command(monitorIdSchema, async ({ monitorId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	const updated = await monitorService.toggleActive(monitorId, locals.session.activeOrganizationId);

	if (!updated) {
		throw new Error("Monitor not found");
	}

	return { success: true, active: updated.active };
});

export const deleteMonitor = command(monitorIdSchema, async ({ monitorId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	const deleted = await monitorService.delete(monitorId, locals.session.activeOrganizationId);

	if (!deleted) {
		throw new Error("Monitor not found");
	}

	return { success: true };
});
