import { command, query, getRequestEvent } from "$app/server";
import { incidentService } from "$lib/server/services/incident.service";
import * as v from "valibot";

// Query: List incidents for the current organization
export const getIncidents = query(
	v.object({ includeResolved: v.optional(v.boolean()) }),
	async ({ includeResolved = false }) => {
		const { locals } = getRequestEvent();
		if (!locals.session?.activeOrganizationId) {
			return [];
		}

		return incidentService.findByOrganization(locals.session.activeOrganizationId, {
			includeResolved,
		});
	},
);

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
