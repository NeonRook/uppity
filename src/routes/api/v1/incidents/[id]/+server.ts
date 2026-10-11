import { noCaller, notFound } from "#lib/server/api/respond.js";
import { apiReadService } from "#lib/server/services/api-read.service.js";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.apiCaller) return noCaller();
	const found = await apiReadService.getIncident(locals.apiCaller.organizationId, params.id);
	return found ? Response.json(found) : notFound("incident");
};
