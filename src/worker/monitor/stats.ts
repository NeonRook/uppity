import { eq, and, gte, inArray, lt, notInArray, sql, count, type SQLWrapper } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";

import { DEFAULT_PLAN_ID, isSelfHosted, retentionGroups } from "../../lib/constants/plans";
import * as schema from "../../lib/server/db/schema";
import {
	monitorCheck,
	monitorDailyStats,
	monitorStatus,
	monitor,
	incidentMonitor,
	subscription,
} from "../../lib/server/db/schema";
import { db } from "../shared/db";

type Db = PostgresJsDatabase<typeof schema>;

export class StatsService {
	private database: Db;

	constructor(database: Db = db) {
		this.database = database;
	}

	/**
	 * Aggregate stats for a specific monitor and date
	 */
	async aggregateDailyStats(monitorId: string, date: Date): Promise<void> {
		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);

		const endOfDay = new Date(date);
		endOfDay.setHours(23, 59, 59, 999);

		// Get all checks for this monitor on this day
		const checks = await this.database
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
			return;
		}

		const totalChecks = checks.length;
		const successfulChecks = checks.filter(
			(c) => c.status === "up" || c.status === "degraded",
		).length;
		const failedChecks = checks.filter((c) => c.status === "down").length;

		const responseTimes = checks
			.filter((c) => c.responseTimeMs !== null && c.status !== "down")
			.map((c) => c.responseTimeMs!);

		const avgResponseTimeMs =
			responseTimes.length > 0
				? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
				: null;
		const minResponseTimeMs = responseTimes.length > 0 ? Math.min(...responseTimes) : null;
		const maxResponseTimeMs = responseTimes.length > 0 ? Math.max(...responseTimes) : null;

		const uptimePercent = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : null;

		// Count incidents for this monitor
		const [incidentCountResult] = await this.database
			.select({ count: count() })
			.from(incidentMonitor)
			.where(eq(incidentMonitor.monitorId, monitorId));
		const incidentCount = incidentCountResult?.count || 0;

		// Upsert daily stats
		await this.database
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
	 * Aggregate stats for all monitors for a given date
	 */
	async aggregateAllMonitorsForDate(date: Date): Promise<number> {
		const monitors = await this.database.select({ id: monitor.id }).from(monitor);
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

		const checks = await this.database
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

		const uptimePercent24h = (successfulChecks / totalChecks) * 100;

		const responseTimes = checks
			.filter((c) => c.responseTimeMs !== null && c.status !== "down")
			.map((c) => c.responseTimeMs!);

		const avgResponseTimeMs24h =
			responseTimes.length > 0
				? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
				: null;

		await this.database
			.update(monitorStatus)
			.set({
				uptimePercent24h,
				avgResponseTimeMs24h,
				updatedAt: new Date(),
			})
			.where(eq(monitorStatus.monitorId, monitorId));
	}

	/**
	 * Update 24h stats for all active monitors
	 */
	async updateAll24hStats(): Promise<number> {
		const monitors = await this.database
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
	 * Deletes check rows past their organization's retention window.
	 *
	 * Runs one DELETE per distinct window rather than one per organization, so the
	 * query count is bounded by the number of plans, not by the number of tenants.
	 *
	 * `fallbackDays` is the operator's `UPPITY_CHECK_RETENTION_DAYS`. It governs
	 * every organization in self-hosted mode, and plans whose retention is -1.
	 */
	async cleanupOldChecks(fallbackDays: number = 30): Promise<number> {
		if (isSelfHosted()) {
			// Self-hosted has no tenants to distinguish; one global sweep, as before.
			return this.deleteChecksBefore(cutoffFor(fallbackDays));
		}

		const groups = retentionGroups(fallbackDays);
		// The catch-all group is expressed as "not any of the other plans", so it also
		// covers orgs with no subscription row and rows carrying a retired plan id.
		const explicitPlanIds = groups.filter((g) => !g.catchAll).flatMap((g) => g.planIds);
		const effectivePlan = sql<string>`coalesce(${subscription.planId}, ${DEFAULT_PLAN_ID})`;

		let deleted = 0;
		for (const group of groups) {
			const scopedMonitors = this.database
				.select({ id: monitor.id })
				.from(monitor)
				.leftJoin(subscription, eq(subscription.organizationId, monitor.organizationId))
				.where(
					group.catchAll
						? explicitPlanIds.length > 0
							? notInArray(effectivePlan, explicitPlanIds)
							: undefined
						: inArray(effectivePlan, group.planIds),
				);

			deleted += await this.deleteChecksBefore(cutoffFor(group.days), scopedMonitors);
		}

		return deleted;
	}

	/**
	 * Deletes checks older than `cutoff`, optionally restricted to a monitor subquery.
	 *
	 * Uses the driver's row count rather than `.returning()`: the first run after a
	 * retention window shrinks can delete millions of rows, and there is no reason to
	 * materialise every id just to count them.
	 */
	private async deleteChecksBefore(cutoff: Date, scopedMonitors?: SQLWrapper): Promise<number> {
		const where =
			scopedMonitors === undefined
				? lt(monitorCheck.checkedAt, cutoff)
				: and(lt(monitorCheck.checkedAt, cutoff), inArray(monitorCheck.monitorId, scopedMonitors));

		const result = await this.database.delete(monitorCheck).where(where);
		return result.count ?? 0;
	}
}

/** Returns the timestamp `days` before now. */
function cutoffFor(days: number): Date {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);
	return cutoff;
}

export const statsService = new StatsService();
