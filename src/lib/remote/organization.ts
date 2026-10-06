import { getRequestEvent } from "$app/server";

/** The caller's active organization, or undefined when there is none. */
export function getActiveOrganizationId(): string | undefined {
	return getRequestEvent().locals.session?.activeOrganizationId ?? undefined;
}

/** The caller's active organization; throws when there is none. */
export function requireOrganizationId(): string {
	const organizationId = getActiveOrganizationId();
	if (!organizationId) throw new Error("Not authenticated");
	return organizationId;
}
