import { parseAuditFilters } from "$lib/server/audit-filters";
import { auditService } from "$lib/server/services/audit.service";
import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
	// Endpoints do not inherit layout loads, so the (admin) gate does not cover
	// this route. Re-check the role explicitly.
	if (locals.user?.role !== "admin") {
		error(403, "Admin access required");
	}

	const { page: _page, ...filters } = parseAuditFilters(url);
	const csv = await auditService.exportCsv(filters);

	return new Response(csv, {
		headers: {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": 'attachment; filename="uppity-audit-log.csv"',
		},
	});
};
