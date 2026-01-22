import { command, query, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import { monitor, monitorStatus } from "$lib/server/db/schema";
import { monitorService } from "$lib/server/services/monitor.service";
import { eq, desc } from "drizzle-orm";
import * as v from "valibot";

// Query: List monitors with status for the current organization
export const getMonitors = query(async () => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		return [];
	}

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
});

const monitorIdSchema = v.object({
	monitorId: v.pipe(v.string(), v.minLength(1)),
});

export const toggleMonitor = command(monitorIdSchema, async ({ monitorId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	const updated = await monitorService.toggleActive(monitorId, locals.session.activeOrganizationId);

	if (!updated) {
		throw new Error("Monitor not found");
	}

	return { success: true, active: updated.active };
});

export const deleteMonitor = command(monitorIdSchema, async ({ monitorId }) => {
	const { locals } = getRequestEvent();
	if (!locals.session?.activeOrganizationId) {
		throw new Error("Not authenticated");
	}

	const deleted = await monitorService.delete(monitorId, locals.session.activeOrganizationId);

	if (!deleted) {
		throw new Error("Monitor not found");
	}

	return { success: true };
});
