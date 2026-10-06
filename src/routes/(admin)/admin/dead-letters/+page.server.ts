import { fail } from "@sveltejs/kit";

import { getActor } from "#lib/server/audit-actor.js";
import { adminService } from "#lib/server/services/admin.service.js";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({
	monitors: await adminService.listDeadLetterMonitors(),
});

export const actions: Actions = {
	reset: async (event) => {
		const monitorId = (await event.request.formData()).get("monitorId");
		if (typeof monitorId !== "string" || !monitorId) {
			return fail(400, { message: "Monitor ID is required" });
		}

		if (!(await adminService.resetDeadLetter(await getActor(event), monitorId))) {
			return fail(404, { message: "Monitor is not dead-lettered" });
		}
		return { reset: monitorId };
	},
};
