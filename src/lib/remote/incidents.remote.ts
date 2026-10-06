import { command, query } from "$app/server";
import * as v from "valibot";

import { getActiveOrganizationId, requireOrganizationId } from "#lib/remote/organization.js";
import { incidentService } from "#lib/server/services/incident.service.js";

// Query: List incidents for the current organization
export const getIncidents = query(
	v.object({ includeResolved: v.optional(v.boolean()) }),
	async ({ includeResolved = false }) => {
		const organizationId = getActiveOrganizationId();
		if (!organizationId) return [];

		return incidentService.findByOrganization(organizationId, { includeResolved });
	},
);

const incidentIdSchema = v.object({
	incidentId: v.pipe(v.string(), v.minLength(1)),
});

export const deleteIncident = command(incidentIdSchema, async ({ incidentId }) => {
	const organizationId = requireOrganizationId();

	const deleted = await incidentService.delete(incidentId, organizationId);

	if (!deleted) {
		throw new Error("Incident not found");
	}

	return { success: true };
});
