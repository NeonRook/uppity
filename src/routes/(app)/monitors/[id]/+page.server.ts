import { error } from "@sveltejs/kit";
import { eq, desc } from "drizzle-orm";

import { checksOverdue } from "#lib/server/check-state.js";
import { db } from "#lib/server/db/index.js";
import { monitor, monitorStatus, monitorCheck } from "#lib/server/db/schema.js";
import { MonitorChannelService } from "#lib/server/services/monitor-channel.service.js";
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

	const [schedule] = await db
		.select({ overdue: checksOverdue })
		.from(monitor)
		.where(eq(monitor.id, params.id));

	// Get recent checks
	const recentChecks = await db
		.select()
		.from(monitorCheck)
		.where(eq(monitorCheck.monitorId, params.id))
		.orderBy(desc(monitorCheck.checkedAt))
		.limit(50);

	const alerts = await new MonitorChannelService(db).summary(
		params.id,
		locals.session.activeOrganizationId,
	);

	return {
		monitor: monitorData,
		status: statusData || null,
		checksOverdue: schedule?.overdue ?? false,
		recentChecks,
		alerts,
	};
};
