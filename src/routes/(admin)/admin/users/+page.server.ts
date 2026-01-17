import { auth } from "$lib/server/auth";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, request }) => {
	const page = parseInt(url.searchParams.get("page") || "1", 10);
	const search = url.searchParams.get("search") || undefined;
	const limit = 20;
	const offset = (page - 1) * limit;

	const result = await auth.api.listUsers({
		headers: request.headers,
		query: {
			limit,
			offset,
			...(search && { searchValue: search }),
			sortBy: "createdAt",
			sortDirection: "desc",
		},
	});

	return {
		users: result.users,
		total: result.total,
		page,
		limit,
		search: search || "",
	};
};
