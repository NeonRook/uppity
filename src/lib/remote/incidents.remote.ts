import { command, getRequestEvent } from "$app/server";
import { incidentService } from "$lib/server/services/incident.service";
import * as v from "valibot";

const incidentIdSchema = v.object({
	incidentId: v.pipe(v.string(), v.minLength(1)),
});

export const deleteIncident = command(incidentIdSchema, async ({ incidentId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	const deleted = await incidentService.delete(incidentId, locals.session.activeOrganizationId);

	if (!deleted) {
		throw new Error("Incident not found");
	}

	return { success: true };
});
