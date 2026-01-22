import { db } from "$lib/server/db";
import { monitor, monitorStatus, monitorCheck } from "$lib/server/db/schema";
import { error } from "@sveltejs/kit";
import { eq, and, desc } from "drizzle-orm";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.session?.activeOrganizationId) {
		error(401, "Not authenticated");
	}

	// Get monitor
	const [monitorData] = await db
		.select()
		.from(monitor)
		.where(
			and(
				eq(monitor.id, params.id),
				eq(monitor.organizationId, locals.session.activeOrganizationId),
			),
		)
		.limit(1);

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
