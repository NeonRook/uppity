import { adminService } from "$lib/server/services/admin.service";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const page = parseInt(url.searchParams.get("page") || "1", 10);
	const search = url.searchParams.get("search") || undefined;
	const limit = 20;
	const offset = (page - 1) * limit;

	const { organizations, total } = await adminService.listAllOrganizations(limit, offset, search);

	return {
		organizations,
		total,
		page,
		limit,
		search: search || "",
	};
};
