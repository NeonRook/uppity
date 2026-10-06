import { error } from "@sveltejs/kit";
import { eq, desc } from "drizzle-orm";

import { db } from "#lib/server/db/index.js";
import { monitorStatus, monitorCheck } from "#lib/server/db/schema.js";
import { monitorService } from "#lib/server/services/monitor.service.js";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		error(401, "Not authenticated");
	}

	const monitorData = await monitorService.findByIdAndOrg(
		params.id,
		locals.session.activeOrganizationId,
	);

	if (!monitorData) {
		error(404, "Monitor not found");
	}

	// Get status
	const [statusData] = await db
		.select()
		.from(monitorStatus)
		.where(eq(monitorStatus.monitorId, params.id))
		.limit(1);

	// Get recent checks
	const recentChecks = await db
		.select()
		.from(monitorCheck)
		.where(eq(monitorCheck.monitorId, params.id))
		.orderBy(desc(monitorCheck.checkedAt))
		.limit(50);

	return {
		monitor: monitorData,
		status: statusData || null,
		recentChecks,
	};
};
