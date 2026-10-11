import { parsePage } from "#lib/server/api/pagination.js";
import { invalidRequest, noCaller, notFound } from "#lib/server/api/respond.js";
import { apiReadService } from "#lib/server/services/api-read.service.js";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.apiCaller) return noCaller();
	const page = parsePage(url.searchParams);
	if (typeof page === "string") return invalidRequest(page);

	const owned = await apiReadService.getMonitor(locals.apiCaller.organizationId, params.id);
	if (!owned) return notFound("monitor");

	const result = await apiReadService.listChecks(params.id, page);
	return result ? Response.json(result) : invalidRequest("Unknown cursor.");
};
