import { error } from "@sveltejs/kit";

import { monitorService } from "#lib/server/services/monitor.service.js";

import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		error(401, "Not authenticated");
	}

	const result = await monitorService.resetDeadLetter(
		params.id,
		locals.session.activeOrganizationId,
	);

	if (!result) {
		error(404, "Monitor not found");
	}

	return Response.json({ success: true, monitor: result });
};
