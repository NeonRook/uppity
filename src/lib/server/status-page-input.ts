import type { UpdateStatusPageForm } from "#lib/schemas/status-page.js";

/** Maps validated form data to the status page fields it edits. */
export function toStatusPageInput(data: UpdateStatusPageForm) {
	return {
		name: data.name,
		slug: data.slug.toLowerCase(),
		description: data.description,
		isPublic: data.isPublic ?? false,
		logoUrl: data.logoUrl || undefined,
		primaryColor: data.primaryColor ?? "#000000",
	};
}
