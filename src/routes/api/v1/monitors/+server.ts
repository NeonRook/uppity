import { parsePage } from "#lib/server/api/pagination.js";
import { invalidRequest, noCaller } from "#lib/server/api/respond.js";
import { apiReadService } from "#lib/server/services/api-read.service.js";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.apiCaller) return noCaller();
	const page = parsePage(url.searchParams);
	if (typeof page === "string") return invalidRequest(page);

	const result = await apiReadService.listMonitors(locals.apiCaller.organizationId, page);
	return result ? Response.json(result) : invalidRequest("Unknown cursor.");
};
