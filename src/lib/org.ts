import { organization } from "#lib/auth-client.js";

/** Makes an organization the active one, then reloads so every org-scoped load and query starts clean. */
export async function switchOrganization(organizationId: string, activeId?: string) {
	if (organizationId === activeId) return;
	try {
		await organization.setActive({ organizationId });
		window.location.reload();
	} catch (error) {
		console.error("Failed to switch organization:", error);
	}
}
