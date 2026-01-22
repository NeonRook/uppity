import { command, getRequestEvent } from "$app/server";
import { statusPageService } from "$lib/server/services/status-page.service";
import * as v from "valibot";

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
