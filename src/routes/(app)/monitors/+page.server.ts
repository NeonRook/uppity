import { db } from "$lib/server/db";
import { monitor, monitorStatus } from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		return { monitors: [] };
	}

	const monitors = await db
		.select({
			id: monitor.id,
			name: monitor.name,
			description: monitor.description,
			type: monitor.type,
			url: monitor.url,
			hostname: monitor.hostname,
			port: monitor.port,
			active: monitor.active,
			intervalSeconds: monitor.intervalSeconds,
			createdAt: monitor.createdAt,
			status: monitorStatus.status,
			lastCheckAt: monitorStatus.lastCheckAt,
			consecutiveFailures: monitorStatus.consecutiveFailures,
			uptimePercent24h: monitorStatus.uptimePercent24h,
			avgResponseTimeMs24h: monitorStatus.avgResponseTimeMs24h,
		})
		.from(monitor)
		.leftJoin(monitorStatus, eq(monitor.id, monitorStatus.monitorId))
		.where(eq(monitor.organizationId, locals.session.activeOrganizationId))
		.orderBy(desc(monitor.createdAt));

	return { monitors };
};
