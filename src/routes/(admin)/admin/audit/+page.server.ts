import { AUDIT_ACTIONS, AUDIT_PAGE_SIZE, AUDIT_TARGET_TYPES } from "$lib/constants/audit";
import { parseAuditFilters } from "$lib/server/audit-filters";
import { auditService } from "$lib/server/services/audit.service";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const { page, ...filters } = parseAuditFilters(url);

	const { entries, total } = await auditService.list({
		...filters,
		limit: AUDIT_PAGE_SIZE,
		offset: (page - 1) * AUDIT_PAGE_SIZE,
	});

	return {
		entries,
		total,
		page,
		limit: AUDIT_PAGE_SIZE,
		actions: AUDIT_ACTIONS,
		targetTypes: AUDIT_TARGET_TYPES,
		exportQuery: url.searchParams.toString(),
	};
};
