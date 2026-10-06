import type * as v from "valibot";

import type { updateStatusPageSchema } from "#lib/schemas/status-page.js";

/** Maps validated form data to the status page fields it edits. */
export function toStatusPageInput(data: v.InferInput<typeof updateStatusPageSchema>) {
	return {
		name: data.name,
		slug: data.slug.toLowerCase(),
		description: data.description,
		isPublic: data.isPublic ?? false,
		logoUrl: data.logoUrl || undefined,
		primaryColor: data.primaryColor ?? "#000000",
	};
}
