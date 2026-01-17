import { redirect } from "@sveltejs/kit";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Allow login page for unauthenticated users
	if (url.pathname === "/admin/login") {
		if (locals.user?.role === "admin") {
			redirect(302, "/admin");
		}
		return {};
	}

	// Require authentication for all other admin routes
	if (!locals.user) {
		redirect(302, "/admin/login");
	}

	// Require admin role
	if (locals.user.role !== "admin") {
		redirect(302, "/admin/login");
	}

	return { user: locals.user };
};
