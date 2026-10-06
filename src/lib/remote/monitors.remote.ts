import { command, query } from "$app/server";
import { eq, desc, sql } from "drizzle-orm";
import * as v from "valibot";

import { getActiveOrganizationId, requireOrganizationId } from "#lib/remote/organization.js";
import { db } from "#lib/server/db/index.js";
import { monitor, monitorStatus } from "#lib/server/db/schema.js";
import { monitorService } from "#lib/server/services/monitor.service.js";

// Query: List monitors with status for the current organization
export const getMonitors = query(async () => {
	const organizationId = getActiveOrganizationId();
	if (!organizationId) return [];

	return db
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
			// A dead-lettered monitor's recorded status is stale; "unchecked" replaces it.
			status: sql<
				string | null
			>`CASE WHEN ${monitor.active} AND ${monitor.deadLetteredAt} IS NOT NULL THEN 'unchecked' ELSE ${monitorStatus.status} END`,
			nextCheckAt: monitor.nextCheckAt,
			lastCheckAt: monitorStatus.lastCheckAt,
			consecutiveFailures: monitorStatus.consecutiveFailures,
			uptimePercent24h: monitorStatus.uptimePercent24h,
			avgResponseTimeMs24h: monitorStatus.avgResponseTimeMs24h,
		})
		.from(monitor)
		.leftJoin(monitorStatus, eq(monitor.id, monitorStatus.monitorId))
		.where(eq(monitor.organizationId, organizationId))
		.orderBy(desc(monitor.createdAt));
});

const monitorIdSchema = v.object({
	monitorId: v.pipe(v.string(), v.minLength(1)),
});

export const toggleMonitor = command(monitorIdSchema, async ({ monitorId }) => {
	const organizationId = requireOrganizationId();

	const updated = await monitorService.toggleActive(monitorId, organizationId);

	if (!updated) {
		throw new Error("Monitor not found");
	}

	return { success: true, active: updated.active };
});

export const deleteMonitor = command(monitorIdSchema, async ({ monitorId }) => {
	const organizationId = requireOrganizationId();

	const deleted = await monitorService.delete(monitorId, organizationId);

	if (!deleted) {
		throw new Error("Monitor not found");
	}

	return { success: true };
});
