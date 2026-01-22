import { command, query, getRequestEvent } from "$app/server";
import { statusPageService } from "$lib/server/services/status-page.service";
import * as v from "valibot";

// Query: List status pages for the current organization
export const getStatusPages = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		return [];
	}

	return statusPageService.findByOrganization(locals.session.activeOrganizationId);
});

const statusPageIdSchema = v.object({
	statusPageId: v.pipe(v.string(), v.minLength(1)),
});

export const deleteStatusPage = command(statusPageIdSchema, async ({ statusPageId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	const deleted = await statusPageService.delete(statusPageId, locals.session.activeOrganizationId);

	if (!deleted) {
		throw new Error("Status page not found");
	}

	return { success: true };
});
