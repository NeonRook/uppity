import { fail } from "@sveltejs/kit";

import { getActor } from "#lib/server/audit-actor.js";
import { adminService } from "#lib/server/services/admin.service.js";

import type { Actions, PageServerLoad } from "./$types";

const normalize = (email: unknown) => (typeof email === "string" ? email.trim().toLowerCase() : "");

export const load: PageServerLoad = async ({ url }) => {
	const email = normalize(url.searchParams.get("email"));
	return { email, suppression: email ? await adminService.getSuppression(email) : null };
};

export const actions: Actions = {
	lift: async (event) => {
		const email = normalize((await event.request.formData()).get("email"));
		if (!(await adminService.liftSuppression(await getActor(event), email))) {
			return fail(404, { message: "Address is not suppressed" });
		}
		return { lifted: email };
	},
};
