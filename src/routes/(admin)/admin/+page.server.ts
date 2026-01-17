import { adminService } from "$lib/server/services/admin.service";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const stats = await adminService.getDashboardStats();

	return { stats };
};
