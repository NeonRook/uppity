import { db } from "$lib/server/db";
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
	type StatusPage,
	type StatusPageGroup,
	type StatusPageMonitor,
} from "$lib/server/db/schema";
import { eq, and, desc, asc, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

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
	name: string;
	description?: string;
	order?: number;
	isCollapsed?: boolean;
}

export interface AddMonitorInput {
	statusPageId: string;
	monitorId: string;
	groupId?: string;
	displayName?: string;
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

export interface PublicStatusPageData {
	page: StatusPage;
	groups: Array<{
		id: string;
		name: string;
		description: string | null;
		isCollapsed: boolean;
		monitors: PublicMonitorStatus[];
	}>;
	ungroupedMonitors: PublicMonitorStatus[];
	overallStatus: "operational" | "degraded" | "partial_outage" | "major_outage";
	activeIncidents: PublicIncidentData[];
	resolvedIncidents: PublicIncidentData[];
}

export interface PublicMonitorStatus {
	id: string;
	name: string;
	description: string | null;
	status: "up" | "down" | "degraded" | "unknown";
	uptimePercent90d: number;
	dailyHistory: Array<{
		date: string;
		status: "up" | "down" | "degraded" | "partial";
		uptimePercent: number;
	}>;
}

export class StatusPageService {
	async create(input: CreateStatusPageInput): Promise<StatusPage> {
		const id = nanoid();

		// Check slug uniqueness
		const existing = await this.findBySlug(input.slug);
		if (existing) {
			throw new Error("Slug already taken");
		}

		const [newPage] = await db
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
				primaryColor: input.primaryColor || "#000000",
				customCss: input.customCss,
			})
			.returning();

		return newPage;
	}

	async findById(id: string): Promise<StatusPage | null> {
		const [result] = await db.select().from(statusPage).where(eq(statusPage.id, id)).limit(1);

		return result || null;
	}

	async findBySlug(slug: string): Promise<StatusPage | null> {
		const [result] = await db.select().from(statusPage).where(eq(statusPage.slug, slug)).limit(1);

		return result || null;
	}

	async findByIdAndOrg(id: string, organizationId: string): Promise<StatusPage | null> {
		const [result] = await db
			.select()
			.from(statusPage)
			.where(and(eq(statusPage.id, id), eq(statusPage.organizationId, organizationId)))
			.limit(1);

		return result || null;
	}

	async findByOrganization(organizationId: string): Promise<StatusPage[]> {
		return db
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

		// Check slug uniqueness if changing
		if (input.slug && input.slug !== existing.slug) {
			const slugExists = await this.findBySlug(input.slug);
			if (slugExists) {
				throw new Error("Slug already taken");
			}
		}

		const [updated] = await db
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
		const existing = await this.findByIdAndOrg(id, organizationId);
		if (!existing) {
			return false;
		}

		await db
			.delete(statusPage)
			.where(and(eq(statusPage.id, id), eq(statusPage.organizationId, organizationId)));

		return true;
	}

	// Group management
	async createGroup(input: CreateGroupInput): Promise<StatusPageGroup> {
		const id = nanoid();

		const [group] = await db
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
		return db
			.select()
			.from(statusPageGroup)
			.where(eq(statusPageGroup.statusPageId, statusPageId))
			.orderBy(asc(statusPageGroup.order));
	}

	async updateGroup(
		id: string,
		input: Partial<Pick<StatusPageGroup, "name" | "description" | "order" | "isCollapsed">>,
	): Promise<StatusPageGroup | null> {
		const [updated] = await db
			.update(statusPageGroup)
			.set(input)
			.where(eq(statusPageGroup.id, id))
			.returning();

		return updated || null;
	}

	async deleteGroup(id: string): Promise<void> {
		await db.delete(statusPageGroup).where(eq(statusPageGroup.id, id));
	}

	// Monitor management
	async addMonitor(input: AddMonitorInput): Promise<StatusPageMonitor> {
		const id = nanoid();

		const [pageMonitor] = await db
			.insert(statusPageMonitor)
			.values({
				id,
				statusPageId: input.statusPageId,
				monitorId: input.monitorId,
				groupId: input.groupId,
				displayName: input.displayName,
				order: input.order ?? 0,
			})
			.onConflictDoUpdate({
				target: [statusPageMonitor.statusPageId, statusPageMonitor.monitorId],
				set: {
					groupId: input.groupId,
					displayName: input.displayName,
					order: input.order ?? 0,
				},
			})
			.returning();

		return pageMonitor;
	}

	async getMonitors(statusPageId: string): Promise<
		Array<{
			pageMonitor: StatusPageMonitor;
			monitor: {
				id: string;
				name: string;
				description: string | null;
				type: string;
				url: string | null;
			};
			status: {
				status: string;
				lastCheckAt: Date | null;
			} | null;
		}>
	> {
		const results = await db
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
			.leftJoin(monitorStatus, eq(monitor.id, monitorStatus.monitorId))
			.where(eq(statusPageMonitor.statusPageId, statusPageId))
			.orderBy(asc(statusPageMonitor.order));

		return results;
	}

	async removeMonitor(statusPageId: string, monitorId: string): Promise<void> {
		await db
			.delete(statusPageMonitor)
			.where(
				and(
					eq(statusPageMonitor.statusPageId, statusPageId),
					eq(statusPageMonitor.monitorId, monitorId),
				),
			);
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

		// Get 90-day history for each monitor
		const ninetyDaysAgo = new Date();
		ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

		const monitorIds = pageMonitors.map((pm) => pm.monitor.id);

		// Get daily stats (we'll compute them from checks)
		const checksData =
			monitorIds.length > 0
				? await db
						.select({
							monitorId: monitorCheck.monitorId,
							date: sql<string>`DATE(${monitorCheck.checkedAt})`.as("date"),
							totalChecks: sql<number>`COUNT(*)`.as("total_checks"),
							upChecks:
								sql<number>`SUM(CASE WHEN ${monitorCheck.status} = 'up' THEN 1 ELSE 0 END)`.as(
									"up_checks",
								),
							downChecks:
								sql<number>`SUM(CASE WHEN ${monitorCheck.status} = 'down' THEN 1 ELSE 0 END)`.as(
									"down_checks",
								),
							degradedChecks:
								sql<number>`SUM(CASE WHEN ${monitorCheck.status} = 'degraded' THEN 1 ELSE 0 END)`.as(
									"degraded_checks",
								),
						})
						.from(monitorCheck)
						.where(
							and(
								inArray(monitorCheck.monitorId, monitorIds),
								gte(monitorCheck.checkedAt, ninetyDaysAgo),
							),
						)
						.groupBy(monitorCheck.monitorId, sql`DATE(${monitorCheck.checkedAt})`)
						.orderBy(sql`DATE(${monitorCheck.checkedAt})`)
				: [];

		// Build monitor status map
		const monitorHistoryMap = new Map<
			string,
			Map<string, { up: number; down: number; degraded: number; total: number }>
		>();
		for (const check of checksData) {
			if (!monitorHistoryMap.has(check.monitorId)) {
				monitorHistoryMap.set(check.monitorId, new Map());
			}
			monitorHistoryMap.get(check.monitorId)!.set(check.date, {
				up: Number(check.upChecks),
				down: Number(check.downChecks),
				degraded: Number(check.degradedChecks),
				total: Number(check.totalChecks),
			});
		}

		// Build daily history for each monitor
		const buildMonitorStatus = (pm: (typeof pageMonitors)[0]): PublicMonitorStatus => {
			const history = monitorHistoryMap.get(pm.monitor.id) || new Map();
			const dailyHistory: PublicMonitorStatus["dailyHistory"] = [];

			// Generate 90 days of history
			for (let i = 89; i >= 0; i--) {
				const date = new Date();
				date.setDate(date.getDate() - i);
				const [dateStr] = date.toISOString().split("T");
				const dayData = history.get(dateStr);

				if (dayData) {
					const uptimePercent = dayData.total > 0 ? (dayData.up / dayData.total) * 100 : 100;
					let status: "up" | "down" | "degraded" | "partial" = "up";
					if (dayData.down > 0 && dayData.up === 0) {
						status = "down";
					} else if (dayData.down > 0) {
						status = "partial";
					} else if (dayData.degraded > 0) {
						status = "degraded";
					}
					dailyHistory.push({ date: dateStr, status, uptimePercent });
				} else {
					// No data for this day - assume up or unknown
					dailyHistory.push({ date: dateStr, status: "up", uptimePercent: 100 });
				}
			}

			// Calculate 90-day uptime
			let totalChecks = 0;
			let upChecks = 0;
			for (const [, data] of history) {
				totalChecks += data.total;
				upChecks += data.up;
			}
			const uptimePercent90d = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;

			return {
				id: pm.pageMonitor.id,
				name: pm.pageMonitor.displayName || pm.monitor.name,
				description: pm.monitor.description,
				status: (pm.status?.status as "up" | "down" | "degraded") || "unknown",
				uptimePercent90d,
				dailyHistory,
			};
		};

		// Group monitors
		const groupedMonitors = new Map<string, PublicMonitorStatus[]>();
		const ungroupedMonitors: PublicMonitorStatus[] = [];

		for (const pm of pageMonitors) {
			const monitorStatus = buildMonitorStatus(pm);
			if (pm.pageMonitor.groupId) {
				if (!groupedMonitors.has(pm.pageMonitor.groupId)) {
					groupedMonitors.set(pm.pageMonitor.groupId, []);
				}
				groupedMonitors.get(pm.pageMonitor.groupId)!.push(monitorStatus);
			} else {
				ungroupedMonitors.push(monitorStatus);
			}
		}

		// Build groups with monitors
		const groupsWithMonitors = groups.map((g) => ({
			id: g.id,
			name: g.name,
			description: g.description,
			isCollapsed: g.isCollapsed,
			monitors: groupedMonitors.get(g.id) || [],
		}));

		// Calculate overall status
		const allMonitorStatuses = pageMonitors.map((pm) => pm.status?.status || "unknown");
		let overallStatus: PublicStatusPageData["overallStatus"] = "operational";
		const downCount = allMonitorStatuses.filter((s) => s === "down").length;
		const degradedCount = allMonitorStatuses.filter((s) => s === "degraded").length;

		if (downCount === allMonitorStatuses.length && allMonitorStatuses.length > 0) {
			overallStatus = "major_outage";
		} else if (downCount > 0) {
			overallStatus = "partial_outage";
		} else if (degradedCount > 0) {
			overallStatus = "degraded";
		}

		// Get active incidents
		const activeIncidentsRaw = await db
			.select({
				incident: incident,
				updates: sql<string>`COALESCE(
					json_agg(
						json_build_object(
							'id', ${incidentUpdate.id},
							'status', ${incidentUpdate.status},
							'message', ${incidentUpdate.message},
							'createdAt', ${incidentUpdate.createdAt}
						) ORDER BY ${incidentUpdate.createdAt} DESC
					) FILTER (WHERE ${incidentUpdate.id} IS NOT NULL),
					'[]'
				)`.as("updates"),
			})
			.from(incident)
			.leftJoin(incidentUpdate, eq(incident.id, incidentUpdate.incidentId))
			.innerJoin(incidentMonitor, eq(incident.id, incidentMonitor.incidentId))
			.where(
				and(
					inArray(incidentMonitor.monitorId, monitorIds.length > 0 ? monitorIds : [""]),
					sql`${incident.status} != 'resolved'`,
				),
			)
			.groupBy(incident.id)
			.orderBy(desc(incident.startedAt));

		const activeIncidents = activeIncidentsRaw.map(this.formatIncidentData);

		// Get resolved incidents (last 90 days)
		const resolvedIncidentsRaw = await db
			.select({
				incident: incident,
				updates: sql<string>`COALESCE(
					json_agg(
						json_build_object(
							'id', ${incidentUpdate.id},
							'status', ${incidentUpdate.status},
							'message', ${incidentUpdate.message},
							'createdAt', ${incidentUpdate.createdAt}
						) ORDER BY ${incidentUpdate.createdAt} DESC
					) FILTER (WHERE ${incidentUpdate.id} IS NOT NULL),
					'[]'
				)`.as("updates"),
			})
			.from(incident)
			.leftJoin(incidentUpdate, eq(incident.id, incidentUpdate.incidentId))
			.innerJoin(incidentMonitor, eq(incident.id, incidentMonitor.incidentId))
			.where(
				and(
					inArray(incidentMonitor.monitorId, monitorIds.length > 0 ? monitorIds : [""]),
					sql`${incident.status} = 'resolved'`,
					gte(incident.resolvedAt, ninetyDaysAgo),
				),
			)
			.groupBy(incident.id)
			.orderBy(desc(incident.resolvedAt));

		const resolvedIncidents = resolvedIncidentsRaw.map(this.formatIncidentData);

		return {
			page,
			groups: groupsWithMonitors,
			ungroupedMonitors,
			overallStatus,
			activeIncidents,
			resolvedIncidents,
		};
	}

	// Helper to format incident data
	private formatIncidentData(
		this: void,
		ai: {
			incident: typeof incident.$inferSelect;
			updates: string;
		},
	): PublicIncidentData {
		const updates =
			typeof ai.updates === "string"
				? (JSON.parse(ai.updates) as Array<{
						id: string;
						status: string;
						message: string;
						createdAt: Date;
					}>)
				: (ai.updates as Array<{
						id: string;
						status: string;
						message: string;
						createdAt: Date;
					}>);

		return {
			id: ai.incident.id,
			title: ai.incident.title,
			status: ai.incident.status,
			impact: ai.incident.impact,
			createdAt: ai.incident.createdAt,
			startedAt: ai.incident.startedAt,
			resolvedAt: ai.incident.resolvedAt,
			updates,
		};
	}

	// Get public incident detail for a status page
	async getPublicIncident(
		slug: string,
		incidentId: string,
	): Promise<{
		page: StatusPage;
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
		const incidentMonitorLinks = await db
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

		// Get incident with all updates
		const incidentResult = await db
			.select({
				incident: incident,
				updates: sql<string>`COALESCE(
					json_agg(
						json_build_object(
							'id', ${incidentUpdate.id},
							'status', ${incidentUpdate.status},
							'message', ${incidentUpdate.message},
							'createdAt', ${incidentUpdate.createdAt}
						) ORDER BY ${incidentUpdate.createdAt} DESC
					) FILTER (WHERE ${incidentUpdate.id} IS NOT NULL),
					'[]'
				)`.as("updates"),
			})
			.from(incident)
			.leftJoin(incidentUpdate, eq(incident.id, incidentUpdate.incidentId))
			.where(eq(incident.id, incidentId))
			.groupBy(incident.id);

		if (incidentResult.length === 0) {
			return null;
		}

		const [incidentData] = incidentResult;
		const updates =
			typeof incidentData.updates === "string"
				? (JSON.parse(incidentData.updates) as Array<{
						id: string;
						status: string;
						message: string;
						createdAt: Date;
					}>)
				: (incidentData.updates as Array<{
						id: string;
						status: string;
						message: string;
						createdAt: Date;
					}>);

		// Get affected monitors that are on this status page
		const affectedMonitorIds = new Set(incidentMonitorLinks.map((im) => im.monitorId));
		const affectedMonitors = pageMonitors
			.filter((pm) => affectedMonitorIds.has(pm.monitor.id))
			.map((pm) => ({
				id: pm.pageMonitor.id,
				name: pm.pageMonitor.displayName || pm.monitor.name,
			}));

		return {
			page,
			incident: {
				id: incidentData.incident.id,
				title: incidentData.incident.title,
				status: incidentData.incident.status,
				impact: incidentData.incident.impact,
				createdAt: incidentData.incident.createdAt,
				startedAt: incidentData.incident.startedAt,
				resolvedAt: incidentData.incident.resolvedAt,
				updates,
			},
			affectedMonitors,
		};
	}
}

export const statusPageService = new StatusPageService();
