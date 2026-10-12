import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

/** The caller's active organization, or undefined when there is none. */
export function getActiveOrganizationId(): string | undefined {
	return getRequestEvent().locals.session?.activeOrganizationId ?? undefined;
}

/** The caller's active organization; responds 401 when there is none. */
export function requireOrganizationId(): string {
	const organizationId = getActiveOrganizationId();
	if (!organizationId) error(401, "Not authenticated");
	return organizationId;
}
