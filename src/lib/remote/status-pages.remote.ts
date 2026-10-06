import { command, query } from "$app/server";
import * as v from "valibot";

import { getActiveOrganizationId, requireOrganizationId } from "#lib/remote/organization.js";
import { statusPageService } from "#lib/server/services/status-page.service.js";

// Query: List status pages for the current organization
export const getStatusPages = query(async () => {
	const organizationId = getActiveOrganizationId();
	if (!organizationId) return [];

	return statusPageService.findByOrganization(organizationId);
});

const statusPageIdSchema = v.object({
	statusPageId: v.pipe(v.string(), v.minLength(1)),
});

export const deleteStatusPage = command(statusPageIdSchema, async ({ statusPageId }) => {
	const organizationId = requireOrganizationId();

	const deleted = await statusPageService.delete(statusPageId, organizationId);

	if (!deleted) {
		throw new Error("Status page not found");
	}

	return { success: true };
});
