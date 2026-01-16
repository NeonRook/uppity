import { db } from "$lib/server/db";
import {
	monitorCheck,
	monitorDailyStats,
	monitorStatus,
	monitor,
	incidentMonitor,
} from "$lib/server/db/schema";
import { eq, and, gte, lt, sql, count } from "drizzle-orm";
import { nanoid } from "nanoid";

export class StatsService {
	/**
	 * Aggregate stats for a specific monitor and date
	 */
	async aggregateDailyStats(monitorId: string, date: Date): Promise<void> {
		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);

		const endOfDay = new Date(date);
		endOfDay.setHours(23, 59, 59, 999);

		// Get all checks for this monitor on this day
		const checks = await db
			.select({
				status: monitorCheck.status,
				responseTimeMs: monitorCheck.responseTimeMs,
			})
			.from(monitorCheck)
			.where(
				and(
					eq(monitorCheck.monitorId, monitorId),
					gte(monitorCheck.checkedAt, startOfDay),
					lt(monitorCheck.checkedAt, endOfDay),
				),
			);

		if (checks.length === 0) {
			return; // No data to aggregate
		}

		const totalChecks = checks.length;
		const successfulChecks = checks.filter(
			(c) => c.status === "up" || c.status === "degraded",
		).length;
		const failedChecks = checks.filter((c) => c.status === "down").length;

		// Calculate response time stats (only for successful checks)
		const responseTimes = checks
			.filter((c) => c.responseTimeMs !== null && c.status !== "down")
			.map((c) => c.responseTimeMs!);

		const avgResponseTimeMs =
			responseTimes.length > 0
				? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
				: null;
		const minResponseTimeMs = responseTimes.length > 0 ? Math.min(...responseTimes) : null;
		const maxResponseTimeMs = responseTimes.length > 0 ? Math.max(...responseTimes) : null;

		// Calculate uptime percentage
		const uptimePercent = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : null;

		// Count incidents for this monitor on this day
		const incidentCountResult = await db
			.select({ count: count() })
			.from(incidentMonitor)
			.innerJoin(
				db.select().from(monitor).where(eq(monitor.id, monitorId)).as("m"),
				eq(incidentMonitor.monitorId, sql`m.id`),
			);
		const incidentCount = incidentCountResult[0]?.count || 0;

		// Upsert daily stats
		await db
			.insert(monitorDailyStats)
			.values({
				id: nanoid(),
				monitorId,
				date: startOfDay,
				totalChecks,
				successfulChecks,
				failedChecks,
				avgResponseTimeMs,
				minResponseTimeMs,
				maxResponseTimeMs,
				uptimePercent,
				incidentCount,
			})
			.onConflictDoUpdate({
				target: [monitorDailyStats.monitorId, monitorDailyStats.date],
				set: {
					totalChecks,
					successfulChecks,
					failedChecks,
					avgResponseTimeMs,
					minResponseTimeMs,
					maxResponseTimeMs,
					uptimePercent,
					incidentCount,
				},
			});
	}

	/**
	 * Aggregate stats for all active monitors for a given date
	 */
	async aggregateAllMonitorsForDate(date: Date): Promise<number> {
		const monitors = await db.select({ id: monitor.id }).from(monitor);
		let processed = 0;

		for (const mon of monitors) {
			await this.aggregateDailyStats(mon.id, date);
			processed++;
		}

		return processed;
	}

	/**
	 * Aggregate stats for yesterday (typically run daily)
	 */
	async aggregateYesterday(): Promise<number> {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		return this.aggregateAllMonitorsForDate(yesterday);
	}

	/**
	 * Update 24h rolling stats for a monitor's status record
	 */
	async updateMonitor24hStats(monitorId: string): Promise<void> {
		const now = new Date();
		const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

		// Get all checks in the last 24 hours
		const checks = await db
			.select({
				status: monitorCheck.status,
				responseTimeMs: monitorCheck.responseTimeMs,
			})
			.from(monitorCheck)
			.where(and(eq(monitorCheck.monitorId, monitorId), gte(monitorCheck.checkedAt, dayAgo)));

		if (checks.length === 0) {
			return;
		}

		const totalChecks = checks.length;
		const successfulChecks = checks.filter(
			(c) => c.status === "up" || c.status === "degraded",
		).length;

		// Calculate uptime percentage
		const uptimePercent24h = (successfulChecks / totalChecks) * 100;

		// Calculate average response time
		const responseTimes = checks
			.filter((c) => c.responseTimeMs !== null && c.status !== "down")
			.map((c) => c.responseTimeMs!);

		const avgResponseTimeMs24h =
			responseTimes.length > 0
				? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
				: null;

		// Update monitor status
		await db
			.update(monitorStatus)
			.set({
				uptimePercent24h,
				avgResponseTimeMs24h,
				updatedAt: new Date(),
			})
			.where(eq(monitorStatus.monitorId, monitorId));
	}

	/**
	 * Update 24h stats for all monitors
	 */
	async updateAll24hStats(): Promise<number> {
		const monitors = await db
			.select({ id: monitor.id })
			.from(monitor)
			.where(eq(monitor.active, true));
		let processed = 0;

		for (const mon of monitors) {
			await this.updateMonitor24hStats(mon.id);
			processed++;
		}

		return processed;
	}

	/**
	 * Clean up old check data (keep last N days)
	 */
	async cleanupOldChecks(daysToKeep: number = 30): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

		const result = await db
			.delete(monitorCheck)
			.where(lt(monitorCheck.checkedAt, cutoffDate))
			.returning({ id: monitorCheck.id });

		return result.length;
	}
}

export const statsService = new StatsService();
