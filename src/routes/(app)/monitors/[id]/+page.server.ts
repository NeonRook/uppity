import { error } from "@sveltejs/kit";
import { eq, desc } from "drizzle-orm";

import { RESPONSE_HISTORY_WINDOWS } from "#lib/constants/defaults.js";
import { checksOverdue } from "#lib/server/check-state.js";
import { db } from "#lib/server/db/index.js";
import { monitor, monitorStatus, monitorCheck } from "#lib/server/db/schema.js";
import { MonitorChannelService } from "#lib/server/services/monitor-channel.service.js";
import { monitorService } from "#lib/server/services/monitor.service.js";
import { ResponseHistoryService } from "#lib/server/services/response-history.service.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

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

	const { retentionDays } = (
		await subscriptionService.getOrganizationPlan(locals.session.activeOrganizationId)
	).limits;
	const historyWindows = RESPONSE_HISTORY_WINDOWS.filter(
		(days) => retentionDays === -1 || days <= retentionDays,
	);
	const responseHistory = await new ResponseHistoryService(db).daily(
		params.id,
		Math.max(...historyWindows),
	);

	return {
		monitor: monitorData,
		status: statusData || null,
		checksOverdue: schedule?.overdue ?? false,
		recentChecks,
		alerts,
		historyWindows,
		responseHistory,
	};
};
