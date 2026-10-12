import { and, eq, gte, max, sql } from "drizzle-orm";

import type { Db } from "#lib/server/db/index.js";
import { monitorCheck, monitorDailyStats } from "#lib/server/db/schema.js";
import { dayStatus, recentUtcDayKeys } from "#lib/server/services/status-page.service.js";

export interface ResponseDay {
	/** UTC calendar date, `YYYY-MM-DD`. */
	date: string;
	avgMs: number | null;
	p95Ms: number | null;
	status: "up" | "degraded" | "partial" | "down" | "unknown";
}

interface DayCounts {
	date: string;
	total: number;
	successful: number;
	failed: number;
	degraded: number;
	avgMs: number | null;
	p95Ms: number | null;
}

const notDown = sql`${monitorCheck.status} <> 'down'`;
const checkDay = sql<string>`to_char(${monitorCheck.checkedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

export class ResponseHistoryService {
	constructor(private db: Db) {}

	/**
	 * One entry per UTC day for the last `days` days, oldest first.
	 *
	 * Past days come from the nightly rollup. Days it has not reached yet, always
	 * including today, are rolled up from the raw checks on read. A day without
	 * checks is `unknown` with no response times.
	 */
	async daily(monitorId: string, days: number): Promise<ResponseDay[]> {
		const keys = recentUtcDayKeys(days);
		const since = new Date(`${keys[0]}T00:00:00Z`);

		const rolledUp = await this.db
			.select({
				date: sql<string>`to_char(${monitorDailyStats.date} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
				total: monitorDailyStats.totalChecks,
				successful: monitorDailyStats.successfulChecks,
				failed: monitorDailyStats.failedChecks,
				degraded: monitorDailyStats.degradedChecks,
				avgMs: monitorDailyStats.avgResponseTimeMs,
				p95Ms: monitorDailyStats.p95ResponseTimeMs,
			})
			.from(monitorDailyStats)
			.where(and(eq(monitorDailyStats.monitorId, monitorId), gte(monitorDailyStats.date, since)));

		const [{ latest }] = await this.db
			.select({ latest: max(monitorDailyStats.date) })
			.from(monitorDailyStats)
			.where(eq(monitorDailyStats.monitorId, monitorId));
		const liveSince = latest && latest >= since ? new Date(latest.getTime() + 86_400_000) : since;

		const live = await this.db
			.select({
				date: checkDay,
				total: sql<number>`count(*)::int`,
				successful: sql<number>`(count(*) filter (where ${notDown}))::int`,
				failed: sql<number>`(count(*) filter (where ${monitorCheck.status} = 'down'))::int`,
				degraded: sql<number>`(count(*) filter (where ${monitorCheck.status} = 'degraded'))::int`,
				avgMs: sql<
					number | null
				>`round(avg(${monitorCheck.responseTimeMs}) filter (where ${notDown}))::int`,
				p95Ms: sql<
					number | null
				>`round(percentile_cont(0.95) within group (order by ${monitorCheck.responseTimeMs}) filter (where ${notDown}))::int`,
			})
			.from(monitorCheck)
			.where(and(eq(monitorCheck.monitorId, monitorId), gte(monitorCheck.checkedAt, liveSince)))
			.groupBy(checkDay);

		const byDate = new Map<string, DayCounts>([...rolledUp, ...live].map((d) => [d.date, d]));

		return keys.map((date) => {
			const day = byDate.get(date);
			if (!day || day.total === 0) {
				return { date, avgMs: null, p95Ms: null, status: "unknown" };
			}
			return {
				date,
				avgMs: day.avgMs,
				p95Ms: day.p95Ms,
				status: dayStatus({
					up: day.successful - day.degraded,
					down: day.failed,
					degraded: day.degraded,
				}),
			};
		});
	}
}
