import { error, redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";

const LOGIN_ROUTE = "/(admin)/admin/login";

/**
 * Admits only admins to (admin) routes, except the login page. The (admin)
 * layout load cannot guard them: form actions run without it, and a data
 * request can skip it and run a page load alone.
 */
export const handleAdminGate: Handle = ({ event, resolve }) => {
	const routeId = event.route.id;
	if (
		routeId?.startsWith("/(admin)/") &&
		routeId !== LOGIN_ROUTE &&
		event.locals.user?.role !== "admin"
	) {
		if (event.request.method === "GET") redirect(302, "/admin/login");
		error(403, "Admin access required");
	}
	return resolve(event);
};
