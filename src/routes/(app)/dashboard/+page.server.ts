import { db } from "$lib/server/db";
import { monitor, monitorStatus } from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		return {
			stats: { total: 0, operational: 0, degraded: 0, down: 0 },
			monitors: [],
		};
	}

	const organizationId = locals.session.activeOrganizationId;

	// Get all monitors with status
	const monitors = await db
		.select({
			id: monitor.id,
			name: monitor.name,
			type: monitor.type,
			url: monitor.url,
			active: monitor.active,
			status: monitorStatus.status,
			lastCheckAt: monitorStatus.lastCheckAt,
			uptimePercent24h: monitorStatus.uptimePercent24h,
			avgResponseTimeMs24h: monitorStatus.avgResponseTimeMs24h,
		})
		.from(monitor)
		.leftJoin(monitorStatus, eq(monitor.id, monitorStatus.monitorId))
		.where(eq(monitor.organizationId, organizationId))
		.orderBy(desc(monitor.createdAt));

	// Calculate stats
	const stats = {
		total: monitors.length,
		operational: monitors.filter((m) => m.active && m.status === "up").length,
		degraded: monitors.filter((m) => m.active && m.status === "degraded").length,
		down: monitors.filter((m) => m.active && m.status === "down").length,
	};

	return { stats, monitors };
};
