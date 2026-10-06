import { eq, and, desc, asc, gte, lte, inArray, sql, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";

import { DEFAULT_PRIMARY_COLOR, STATUS_PAGE_HISTORY_DAYS } from "#lib/constants/defaults.js";
import { db, type Db } from "#lib/server/db/index.js";
import {
	statusPage,
	statusPageGroup,
	statusPageMonitor,
	monitor,
	monitorStatus,
	monitorCheck,
	incident,
	incidentMonitor,
	incidentUpdate,
	maintenanceWindow,
	maintenanceWindowMonitor,
	type StatusPage,
	type StatusPageGroup,
	type StatusPageMonitor,
} from "#lib/server/db/schema.js";
import {
	SubscriptionLimitError,
	FeatureNotAvailableError,
	NotFoundError,
} from "#lib/server/errors.js";
import { monitorsBelongToOrg } from "#lib/server/services/monitor-ownership.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

export interface CreateStatusPageInput {
	organizationId: string;
	name: string;
	slug: string;
	description?: string;
	isPublic?: boolean;
	logoUrl?: string;
	faviconUrl?: string;
	primaryColor?: string;
	customCss?: string;
	monitorIds?: string[];
}

export interface UpdateStatusPageInput {
	name?: string;
	slug?: string;
	description?: string;
	isPublic?: boolean;
	logoUrl?: string;
	faviconUrl?: string;
	primaryColor?: string;
	customCss?: string;
	customDomain?: string;
}

export interface CreateGroupInput {
	statusPageId: string;
	organizationId: string;
	name: string;
	description?: string;
	order?: number;
	isCollapsed?: boolean;
}

export interface AddMonitorInput {
	statusPageId: string;
	organizationId: string;
	monitorId: string;
	order?: number;
}

export interface PublicIncidentData {
	id: string;
	title: string;
	status: string;
	impact: string;
	createdAt: Date;
	startedAt: Date;
	resolvedAt: Date | null;
	updates: Array<{
		id: string;
		status: string;
		message: string;
		createdAt: Date;
	}>;
}

/** The status page fields the public pages render, and nothing else. */
export type PublicStatusPage = Pick<
	StatusPage,
	"name" | "slug" | "description" | "logoUrl" | "faviconUrl"
>;

function toPublicPage({
	name,
	slug,
	description,
	logoUrl,
	faviconUrl,
}: StatusPage): PublicStatusPage {
	return { name, slug, description, logoUrl, faviconUrl };
}

export interface PublicStatusPageData {
	page: PublicStatusPage;
	groups: Array<{
		id: string;
		name: string;
		description: string | null;
		isCollapsed: boolean;
		monitors: PublicMonitorStatus[];
	}>;
	ungroupedMonitors: PublicMonitorStatus[];
	overallStatus:
		| "operational"
		| "degraded"
		| "partial_outage"
		| "major_outage"
		| "under_maintenance";
	activeIncidents: PublicIncidentData[];
	resolvedIncidents: PublicIncidentData[];
	activeMaintenance: PublicMaintenanceView[];
	upcomingMaintenance: PublicMaintenanceView[];
}

export interface PublicMonitorStatus {
	id: string;
	name: string;
	description: string | null;
	status: "up" | "down" | "degraded" | "unknown" | "maintenance";
	/** Null when nothing was measured in the window. Not the same as 100%. */
	uptimePercent90d: number | null;
	// Days fully covered by a maintenance window fall into the no-data branch
	// (their checks are excluded from aggregation) and so read as "unknown". A
	// future improvement would propagate per-day window coverage and emit a
	// "maintenance" bar.
	dailyHistory: Array<{
		date: string;
		status: "up" | "down" | "degraded" | "partial" | "unknown";
		uptimePercent: number | null;
	}>;
}

export interface PublicMaintenanceView {
	id: string;
	name: string;
	description: string | null;
	startsAt: Date;
	endsAt: Date;
}

interface MaintenanceView extends PublicMaintenanceView {
	affectedMonitorIds: string[];
}

function toPublicMaintenance({
	id,
	name,
	description,
	startsAt,
	endsAt,
}: MaintenanceView): PublicMaintenanceView {
	return { id, name, description, startsAt, endsAt };
}

export interface FeaturedUptimeDay {
	date: string;
	status: "up" | "down" | "degraded" | "partial" | "unknown";
	/** Null when no check ran that day — an absent reading, not a perfect one. */
	uptimePercent: number | null;
}

export interface FeaturedUptime {
	slug: string;
	name: string;
	days: FeaturedUptimeDay[];
	uptimePercent: number | null;
}

/**
 * The last `count` day keys as `YYYY-MM-DD`, oldest first.
 *
 * Uptime bands are UTC days. That is the boundary Postgres already applies:
 * `checked_at` is a timestamp without time zone holding a UTC wall clock, so
 * `DATE(checked_at)` yields the UTC calendar date whatever timezone the
 * database session or the Node process runs in. Building the keys with local
 * `getDate`/`setDate` and then formatting them with `toISOString` mixed the two
 * calendars and shifted the whole array by a day for anyone whose local date
 * differed from UTC's.
 *
 * A reader far from UTC therefore sees a day boundary offset from their own.
 * Making that configurable is a product decision, not a default to drift into.
 */
function recentUtcDayKeys(count: number): string[] {
	const today = new Date();
	const keys: string[] = [];
	for (let i = count - 1; i >= 0; i--) {
		const date = new Date(today);
		date.setUTCDate(date.getUTCDate() - i);
		const [dateStr] = date.toISOString().split("T");
		keys.push(dateStr);
	}
	return keys;
}

const incidentUpdates = sql<PublicIncidentData["updates"]>`COALESCE(
	json_agg(
		json_build_object(
			'id', ${incidentUpdate.id},
			'status', ${incidentUpdate.status},
			'message', ${incidentUpdate.message},
			'createdAt', ${incidentUpdate.createdAt}
		) ORDER BY ${incidentUpdate.createdAt} DESC
	) FILTER (WHERE ${incidentUpdate.id} IS NOT NULL),
	'[]'
)`;

const countStatus = (status: "up" | "down" | "degraded") =>
	sql<number>`SUM(CASE WHEN ${monitorCheck.status} = ${status} THEN 1 ELSE 0 END)::int`;

function dayStatus(counts: { up: number; down: number; degraded: number }) {
	if (counts.down > 0) return counts.up === 0 ? "down" : "partial";
	return counts.degraded > 0 ? "degraded" : "up";
}

function toMaintenanceViews(
	rows: Array<{ window: typeof maintenanceWindow.$inferSelect; monitorId: string }>,
): MaintenanceView[] {
	return Array.from(Map.groupBy(rows, (r) => r.window.id).values(), (group) => {
		const [{ window }] = group;
		return {
			id: window.id,
			name: window.name,
			description: window.description,
			startsAt: window.startsAt,
			endsAt: window.endsAt,
			affectedMonitorIds: group.map((r) => r.monitorId),
		};
	});
}

export class StatusPageService {
	private db: Db;

	constructor(database: Db) {
		this.db = database;
	}

	async create(input: CreateStatusPageInput): Promise<StatusPage> {
		const monitorIds = [...new Set(input.monitorIds)];
		if (!(await monitorsBelongToOrg(this.db, input.organizationId, monitorIds))) {
			throw new NotFoundError("Monitor not found");
		}

		// Check subscription limits before creating
		const limitCheck = await subscriptionService.canAddStatusPage(input.organizationId);
		if (!limitCheck.allowed) {
			throw new SubscriptionLimitError(limitCheck.message ?? "Status page limit reached");
		}

		const id = nanoid();

		// Check slug uniqueness
		const existing = await this.findBySlug(input.slug);
		if (existing) {
			throw new Error("Slug already taken");
		}

		const [newPage] = await this.db
			.insert(statusPage)
			.values({
				id,
				organizationId: input.organizationId,
				name: input.name,
				slug: input.slug,
				description: input.description,
				isPublic: input.isPublic ?? true,
				logoUrl: input.logoUrl,
				faviconUrl: input.faviconUrl,
				primaryColor: input.primaryColor || DEFAULT_PRIMARY_COLOR,
				customCss: input.customCss,
			})
			.returning();

		if (monitorIds.length > 0) {
			await this.db.insert(statusPageMonitor).values(
				monitorIds.map((monitorId, order) => ({
					id: nanoid(),
					statusPageId: id,
					monitorId,
					order,
				})),
			);
		}

		return newPage;
	}

	async findById(id: string): Promise<StatusPage | null> {
		const [result] = await this.db.select().from(statusPage).where(eq(statusPage.id, id)).limit(1);

		return result || null;
	}

	async findBySlug(slug: string): Promise<StatusPage | null> {
		const [result] = await this.db
			.select()
			.from(statusPage)
			.where(eq(statusPage.slug, slug))
			.limit(1);

		return result || null;
	}

	async findByIdAndOrg(id: string, organizationId: string): Promise<StatusPage | null> {
		const [result] = await this.db
			.select()
			.from(statusPage)
			.where(and(eq(statusPage.id, id), eq(statusPage.organizationId, organizationId)))
			.limit(1);

		return result || null;
	}

	async findByOrganization(organizationId: string): Promise<StatusPage[]> {
		return this.db
			.select()
			.from(statusPage)
			.where(eq(statusPage.organizationId, organizationId))
			.orderBy(desc(statusPage.createdAt));
	}

	async update(
		id: string,
		organizationId: string,
		input: UpdateStatusPageInput,
	): Promise<StatusPage | null> {
		const existing = await this.findByIdAndOrg(id, organizationId);
		if (!existing) {
			return null;
		}

		// Check if custom domain is allowed when setting one
		if (input.customDomain && input.customDomain !== existing.customDomain) {
			const domainCheck = await subscriptionService.areCustomDomainsAllowed(organizationId);
			if (!domainCheck.allowed) {
				throw new FeatureNotAvailableError(domainCheck.message ?? "Custom domains not available");
			}
		}

		// Check slug uniqueness if changing
		if (input.slug && input.slug !== existing.slug) {
			const slugExists = await this.findBySlug(input.slug);
			if (slugExists) {
				throw new Error("Slug already taken");
			}
		}

		const [updated] = await this.db
			.update(statusPage)
			.set({
				...input,
				updatedAt: new Date(),
			})
			.where(and(eq(statusPage.id, id), eq(statusPage.organizationId, organizationId)))
			.returning();

		return updated || null;
	}

	async delete(id: string, organizationId: string): Promise<boolean> {
		const deleted = await this.db
			.delete(statusPage)
			.where(and(eq(statusPage.id, id), eq(statusPage.organizationId, organizationId)))
			.returning({ id: statusPage.id });

		return deleted.length > 0;
	}

	/** Selects the page's id only when it belongs to `organizationId`. */
	private ownedPage(id: string, organizationId: string) {
		return this.db
			.select({ id: statusPage.id })
			.from(statusPage)
			.where(and(eq(statusPage.id, id), eq(statusPage.organizationId, organizationId)));
	}

	// Group management
	async createGroup(input: CreateGroupInput): Promise<StatusPageGroup | null> {
		if (!(await this.findByIdAndOrg(input.statusPageId, input.organizationId))) {
			return null;
		}

		const id = nanoid();

		const [group] = await this.db
			.insert(statusPageGroup)
			.values({
				id,
				statusPageId: input.statusPageId,
				name: input.name,
				description: input.description,
				order: input.order ?? 0,
				isCollapsed: input.isCollapsed ?? false,
			})
			.returning();

		return group;
	}

	async getGroups(statusPageId: string): Promise<StatusPageGroup[]> {
		return this.db
			.select()
			.from(statusPageGroup)
			.where(eq(statusPageGroup.statusPageId, statusPageId))
			.orderBy(asc(statusPageGroup.order));
	}

	async deleteGroup(
		statusPageId: string,
		organizationId: string,
		groupId: string,
	): Promise<boolean> {
		const deleted = await this.db
			.delete(statusPageGroup)
			.where(
				and(
					eq(statusPageGroup.id, groupId),
					inArray(statusPageGroup.statusPageId, this.ownedPage(statusPageId, organizationId)),
				),
			)
			.returning({ id: statusPageGroup.id });

		return deleted.length > 0;
	}

	// Monitor management
	/** Null when the page or the monitor is not in `input.organizationId`. */
	async addMonitor(input: AddMonitorInput): Promise<StatusPageMonitor | null> {
		const [page, monitorOwned] = await Promise.all([
			this.findByIdAndOrg(input.statusPageId, input.organizationId),
			monitorsBelongToOrg(this.db, input.organizationId, [input.monitorId]),
		]);
		if (!page || !monitorOwned) {
			return null;
		}

		const id = nanoid();

		const [pageMonitor] = await this.db
			.insert(statusPageMonitor)
			.values({
				id,
				statusPageId: input.statusPageId,
				monitorId: input.monitorId,
				order: input.order ?? 0,
			})
			.onConflictDoUpdate({
				target: [statusPageMonitor.statusPageId, statusPageMonitor.monitorId],
				set: { order: input.order ?? 0 },
			})
			.returning();

		return pageMonitor;
	}

	async getMonitors(statusPageId: string) {
		return this.db
			.select({
				pageMonitor: statusPageMonitor,
				monitor: {
					id: monitor.id,
					name: monitor.name,
					description: monitor.description,
					type: monitor.type,
					url: monitor.url,
				},
				status: {
					status: monitorStatus.status,
					lastCheckAt: monitorStatus.lastCheckAt,
				},
			})
			.from(statusPageMonitor)
			.innerJoin(monitor, eq(statusPageMonitor.monitorId, monitor.id))
			// A link to another organization's monitor is never shown, even if one exists.
			.innerJoin(
				statusPage,
				and(
					eq(statusPage.id, statusPageMonitor.statusPageId),
					eq(statusPage.organizationId, monitor.organizationId),
				),
			)
			.leftJoin(monitorStatus, eq(monitor.id, monitorStatus.monitorId))
			.where(eq(statusPageMonitor.statusPageId, statusPageId))
			.orderBy(asc(statusPageMonitor.order));
	}

	async removeMonitor(
		statusPageId: string,
		organizationId: string,
		monitorId: string,
	): Promise<boolean> {
		const removed = await this.db
			.delete(statusPageMonitor)
			.where(
				and(
					eq(statusPageMonitor.monitorId, monitorId),
					inArray(statusPageMonitor.statusPageId, this.ownedPage(statusPageId, organizationId)),
				),
			)
			.returning({ id: statusPageMonitor.id });

		return removed.length > 0;
	}

	async getActiveMaintenanceForMonitors(
		monitorIds: string[],
		at: Date = new Date(),
	): Promise<MaintenanceView[]> {
		if (monitorIds.length === 0) return [];

		const rows = await this.db
			.select({
				window: maintenanceWindow,
				monitorId: maintenanceWindowMonitor.monitorId,
			})
			.from(maintenanceWindow)
			.innerJoin(
				maintenanceWindowMonitor,
				eq(maintenanceWindowMonitor.windowId, maintenanceWindow.id),
			)
			.where(
				and(
					inArray(maintenanceWindowMonitor.monitorId, monitorIds),
					eq(maintenanceWindow.status, "in_progress"),
					lte(maintenanceWindow.startsAt, at),
					gte(maintenanceWindow.endsAt, at),
				),
			);

		return toMaintenanceViews(rows).toSorted((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
	}

	async getUpcomingMaintenanceForMonitors(
		monitorIds: string[],
		withinDays: number,
		at: Date = new Date(),
	): Promise<MaintenanceView[]> {
		if (monitorIds.length === 0) return [];

		const horizon = new Date(at.getTime() + withinDays * 24 * 60 * 60 * 1000);
		const rows = await this.db
			.select({
				window: maintenanceWindow,
				monitorId: maintenanceWindowMonitor.monitorId,
			})
			.from(maintenanceWindow)
			.innerJoin(
				maintenanceWindowMonitor,
				eq(maintenanceWindowMonitor.windowId, maintenanceWindow.id),
			)
			.where(
				and(
					inArray(maintenanceWindowMonitor.monitorId, monitorIds),
					eq(maintenanceWindow.status, "scheduled"),
					gte(maintenanceWindow.startsAt, at),
					lte(maintenanceWindow.startsAt, horizon),
				),
			);

		return toMaintenanceViews(rows).toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
	}

	// Public status page data
	async getPublicStatusPage(slug: string): Promise<PublicStatusPageData | null> {
		const page = await this.findBySlug(slug);
		if (!page || !page.isPublic) {
			return null;
		}

		// Get groups
		const groups = await this.getGroups(page.id);

		// Get monitors with their status
		const pageMonitors = await this.getMonitors(page.id);

		// Get history for each monitor
		const historyDaysAgo = new Date();
		historyDaysAgo.setDate(historyDaysAgo.getDate() - STATUS_PAGE_HISTORY_DAYS);

		const monitorIds = pageMonitors.map((pm) => pm.monitor.id);

		const [activeMaintenance, upcomingMaintenance] = await Promise.all([
			this.getActiveMaintenanceForMonitors(monitorIds),
			this.getUpcomingMaintenanceForMonitors(monitorIds, 7),
		]);
		const activeMonitorIdSet = new Set(activeMaintenance.flatMap((w) => w.affectedMonitorIds));

		// Get daily stats (we'll compute them from checks). Checks captured during
		// a window that ran (in_progress or completed) are excluded so maintenance
		// doesn't drag uptime down. Cancelled windows do NOT trigger exclusion —
		// if a window was cancelled, any checks during its planned slot were real.
		const checksData =
			monitorIds.length > 0
				? await this.db
						.select({
							monitorId: monitorCheck.monitorId,
							date: sql<string>`DATE(${monitorCheck.checkedAt})`,
							total: sql<number>`COUNT(*)::int`,
							up: countStatus("up"),
							down: countStatus("down"),
							degraded: countStatus("degraded"),
						})
						.from(monitorCheck)
						.where(
							and(
								inArray(monitorCheck.monitorId, monitorIds),
								gte(monitorCheck.checkedAt, historyDaysAgo),
								sql`NOT EXISTS (
									SELECT 1 FROM ${maintenanceWindowMonitor} mwm
									JOIN ${maintenanceWindow} mw ON mw.id = mwm.window_id
									WHERE mwm.monitor_id = ${monitorCheck.monitorId}
									  AND mw.status IN ('in_progress', 'completed')
									  AND ${monitorCheck.checkedAt} >= mw.starts_at
									  AND ${monitorCheck.checkedAt} <= mw.ends_at
								)`,
							),
						)
						.groupBy(monitorCheck.monitorId, sql`DATE(${monitorCheck.checkedAt})`)
						.orderBy(sql`DATE(${monitorCheck.checkedAt})`)
				: [];

		const checksByMonitor = Map.groupBy(checksData, (c) => c.monitorId);

		const buildMonitorStatus = (pm: (typeof pageMonitors)[0]): PublicMonitorStatus => {
			const rows = checksByMonitor.get(pm.monitor.id) ?? [];
			const byDate = new Map(rows.map((r) => [r.date, r]));

			const dailyHistory = recentUtcDayKeys(STATUS_PAGE_HISTORY_DAYS).map(
				(date): PublicMonitorStatus["dailyHistory"][number] => {
					const day = byDate.get(date);
					// Nothing was checked, so nothing is known. Rendering this as "up"
					// invented ninety days of green for a monitor created yesterday, and
					// DESIGN.md's Null Is Gray Rule exists precisely to forbid that.
					if (!day) return { date, status: "unknown", uptimePercent: null };
					return { date, status: dayStatus(day), uptimePercent: (day.up / day.total) * 100 };
				},
			);

			const totalChecks = rows.reduce((sum, r) => sum + r.total, 0);
			const upChecks = rows.reduce((sum, r) => sum + r.up, 0);

			const status: PublicMonitorStatus["status"] = activeMonitorIdSet.has(pm.monitor.id)
				? "maintenance"
				: (pm.status?.status as "up" | "down" | "degraded") || "unknown";

			return {
				id: pm.pageMonitor.id,
				name: pm.pageMonitor.displayName || pm.monitor.name,
				description: pm.monitor.description,
				status,
				uptimePercent90d: totalChecks > 0 ? (upChecks / totalChecks) * 100 : null,
				dailyHistory,
			};
		};

		const monitorsByGroup = Map.groupBy(pageMonitors, (pm) => pm.pageMonitor.groupId);
		const ungroupedMonitors = (monitorsByGroup.get(null) ?? []).map(buildMonitorStatus);
		const groupsWithMonitors = groups.map((g) => ({
			id: g.id,
			name: g.name,
			description: g.description,
			isCollapsed: g.isCollapsed,
			monitors: (monitorsByGroup.get(g.id) ?? []).map(buildMonitorStatus),
		}));

		// Calculate overall status
		const allMonitorStatuses = pageMonitors.map((pm) =>
			activeMonitorIdSet.has(pm.monitor.id) ? "maintenance" : pm.status?.status || "unknown",
		);
		let overallStatus: PublicStatusPageData["overallStatus"] = "operational";
		const downCount = allMonitorStatuses.filter((s) => s === "down").length;
		const degradedCount = allMonitorStatuses.filter((s) => s === "degraded").length;
		const maintenanceCount = allMonitorStatuses.filter((s) => s === "maintenance").length;

		if (allMonitorStatuses.length > 0 && downCount === allMonitorStatuses.length) {
			overallStatus = "major_outage";
		} else if (downCount > 0) {
			overallStatus = "partial_outage";
		} else if (degradedCount > 0) {
			overallStatus = "degraded";
		} else if (maintenanceCount > 0 && maintenanceCount === allMonitorStatuses.length) {
			overallStatus = "under_maintenance";
		}

		const onThisPage = and(
			eq(incident.organizationId, page.organizationId),
			inArray(
				incident.id,
				this.db
					.select({ id: incidentMonitor.incidentId })
					.from(incidentMonitor)
					.where(inArray(incidentMonitor.monitorId, monitorIds)),
			),
		);
		const [activeIncidents, resolvedIncidents] = await Promise.all([
			this.incidentsWithUpdates(and(onThisPage, sql`${incident.status} != 'resolved'`)),
			this.incidentsWithUpdates(
				and(
					onThisPage,
					sql`${incident.status} = 'resolved'`,
					gte(incident.resolvedAt, historyDaysAgo),
				),
				desc(incident.resolvedAt),
			),
		]);

		return {
			page: toPublicPage(page),
			groups: groupsWithMonitors,
			ungroupedMonitors,
			overallStatus,
			activeIncidents,
			resolvedIncidents,
			activeMaintenance: activeMaintenance.map(toPublicMaintenance),
			upcomingMaintenance: upcomingMaintenance.map(toPublicMaintenance),
		};
	}

	private async incidentsWithUpdates(
		where: SQL | undefined,
		orderBy: SQL = desc(incident.startedAt),
	): Promise<PublicIncidentData[]> {
		const rows = await this.db
			.select({ incident, updates: incidentUpdates })
			.from(incident)
			.leftJoin(incidentUpdate, eq(incident.id, incidentUpdate.incidentId))
			.where(where)
			.groupBy(incident.id)
			.orderBy(orderBy);

		return rows.map(({ incident: row, updates }) => ({
			id: row.id,
			title: row.title,
			status: row.status,
			impact: row.impact,
			createdAt: row.createdAt,
			startedAt: row.startedAt,
			resolvedAt: row.resolvedAt,
			updates,
		}));
	}

	// Get public incident detail for a status page
	async getPublicIncident(
		slug: string,
		incidentId: string,
	): Promise<{
		page: PublicStatusPage;
		incident: PublicIncidentData;
		affectedMonitors: Array<{ id: string; name: string }>;
	} | null> {
		const page = await this.findBySlug(slug);
		if (!page || !page.isPublic) {
			return null;
		}

		// Get monitors on this status page
		const pageMonitors = await this.getMonitors(page.id);
		const monitorIds = pageMonitors.map((pm) => pm.monitor.id);

		if (monitorIds.length === 0) {
			return null;
		}

		// Check if incident affects any of the page's monitors
		const incidentMonitorLinks = await this.db
			.select({ monitorId: incidentMonitor.monitorId })
			.from(incidentMonitor)
			.where(
				and(
					eq(incidentMonitor.incidentId, incidentId),
					inArray(incidentMonitor.monitorId, monitorIds),
				),
			);

		if (incidentMonitorLinks.length === 0) {
			return null;
		}

		const [incidentData] = await this.incidentsWithUpdates(
			and(eq(incident.id, incidentId), eq(incident.organizationId, page.organizationId)),
		);
		if (!incidentData) {
			return null;
		}

		// Get affected monitors that are on this status page
		const affectedMonitorIds = new Set(incidentMonitorLinks.map((im) => im.monitorId));
		const affectedMonitors = pageMonitors
			.filter((pm) => affectedMonitorIds.has(pm.monitor.id))
			.map((pm) => ({
				id: pm.pageMonitor.id,
				name: pm.pageMonitor.displayName || pm.monitor.name,
			}));

		return {
			page: toPublicPage(page),
			incident: incidentData,
			affectedMonitors,
		};
	}

	/**
	 * One aggregated uptime band for a single public status page.
	 *
	 * Deliberately narrower than `getPublicStatusPage`: the landing page renders
	 * one bar, so this collapses every monitor on the page into a single row per
	 * day and skips groups, incidents, maintenance windows and per-monitor
	 * history entirely. `/` is the busiest anonymous route and previously did no
	 * database work at all, so it should not pay for a payload it never renders.
	 *
	 * A day with no checks is `unknown`, not `up`. `getPublicStatusPage` assumes
	 * `up` for missing days, which renders a monitor created yesterday as ninety
	 * days of green; on a surface whose whole purpose is proof that would be a
	 * fabricated history, and DESIGN.md's Null Is Gray Rule says missing
	 * information gets no colour.
	 */
	async getFeaturedUptime(slug: string): Promise<FeaturedUptime | null> {
		const page = await this.findBySlug(slug);
		if (!page || !page.isPublic) {
			return null;
		}

		const since = new Date();
		since.setDate(since.getDate() - (STATUS_PAGE_HISTORY_DAYS - 1));
		since.setHours(0, 0, 0, 0);

		const rows = await this.db
			.select({
				date: sql<string>`DATE(${monitorCheck.checkedAt})`.as("date"),
				total: sql<number>`COUNT(*)::int`,
				up: countStatus("up"),
				down: countStatus("down"),
				degraded: countStatus("degraded"),
			})
			.from(monitorCheck)
			.innerJoin(statusPageMonitor, eq(statusPageMonitor.monitorId, monitorCheck.monitorId))
			.innerJoin(
				monitor,
				and(
					eq(monitor.id, monitorCheck.monitorId),
					eq(monitor.organizationId, page.organizationId),
				),
			)
			.where(and(eq(statusPageMonitor.statusPageId, page.id), gte(monitorCheck.checkedAt, since)))
			.groupBy(sql`DATE(${monitorCheck.checkedAt})`);

		const byDate = new Map(rows.map((r) => [r.date, r]));

		const days: FeaturedUptimeDay[] = [];
		let totalChecks = 0;
		let upChecks = 0;

		for (const dateStr of recentUtcDayKeys(STATUS_PAGE_HISTORY_DAYS)) {
			const row = byDate.get(dateStr);

			if (!row || row.total === 0) {
				days.push({ date: dateStr, status: "unknown", uptimePercent: null });
				continue;
			}

			totalChecks += row.total;
			upChecks += row.up;

			days.push({
				date: dateStr,
				status: dayStatus(row),
				uptimePercent: (row.up / row.total) * 100,
			});
		}

		return {
			slug: page.slug,
			name: page.name,
			days,
			// Null rather than a number when nothing has been measured: an instance
			// with no checks has no uptime, which is not the same as 100%.
			uptimePercent: totalChecks > 0 ? (upChecks / totalChecks) * 100 : null,
		};
	}
}

export const statusPageService = new StatusPageService(db);
