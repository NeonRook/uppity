import { AUDIT_PANEL_LIMIT } from "$lib/constants/audit";
import { adminService } from "$lib/server/services/admin.service";
import { auditService } from "$lib/server/services/audit.service";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const stats = await adminService.getDashboardStats();
	const { entries: recentActivity } = await auditService.list({ limit: AUDIT_PANEL_LIMIT });

	return { stats, recentActivity };
};
