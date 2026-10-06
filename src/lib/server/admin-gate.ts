import { error } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";

/**
 * Rejects non-admin writes to (admin) routes. Form actions and endpoints run
 * without the (admin) layout load, so its redirect does not cover them.
 */
export const handleAdminGate: Handle = ({ event, resolve }) => {
	if (
		event.request.method !== "GET" &&
		event.route.id?.startsWith("/(admin)/") &&
		event.locals.user?.role !== "admin"
	) {
		error(403, "Admin access required");
	}
	return resolve(event);
};
