import { apiError } from "#lib/server/api/respond.js";
import { statusPageService } from "#lib/server/services/status-page.service.js";

import type { RequestHandler } from "./$types";

// Keyless and cross-origin, so other sites can embed what the public page already shows.
const headers = { "access-control-allow-origin": "*", "cache-control": "public, max-age=30" };

export const GET: RequestHandler = async ({ params }) => {
	const summary = await statusPageService.getPublicSummary(params.id);
	return summary
		? Response.json(summary, { headers })
		: apiError(404, "not_found", "No public status page with that id.", headers);
};
