import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Page, PageRequest } from "#lib/server/api/pagination.js";
import { toPage } from "#lib/server/api/pagination.js";
import { checksStopped } from "#lib/server/check-state.js";
import { db, type Db } from "#lib/server/db/index.js";
import {
	incident,
	incidentMonitor,
	incidentUpdate,
	monitor,
	monitorCheck,
	monitorStatus,
} from "#lib/server/db/schema.js";

/**
 * Read models for the public API. Every field is chosen explicitly: a monitor's request
 * headers, body and push token can hold credentials and never leave the app this way.
 */

export type ApiMonitorStatus = "up" | "down" | "degraded" | "unknown" | "not_checked";

export interface ApiMonitor {
	id: string;
	name: string;
	description: string | null;
	type: string;
	active: boolean;
	pausedForCapacity: boolean;
	status: ApiMonitorStatus;
	url: string | null;
	method: string | null;
	hostname: string | null;
	port: number | null;
	intervalSeconds: number;
	timeoutSeconds: number;
	lastCheckAt: Date | null;
	uptimePercent24h: number | null;
	avgResponseTimeMs24h: number | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface ApiCheck {
	id: string;
	status: string;
	statusCode: number | null;
	responseTimeMs: number | null;
	errorMessage: string | null;
	sslExpiresAt: Date | null;
	checkedAt: Date;
}

export interface ApiIncident {
	id: string;
	title: string;
	status: string;
	impact: string;
	autoCreated: boolean;
	startedAt: Date;
	resolvedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface ApiIncidentDetail extends ApiIncident {
	updates: { id: string; status: string; message: string; createdAt: Date }[];
	affectedMonitors: { id: string; name: string }[];
}

const anchorMonitor = alias(monitor, "anchor_monitor");
const anchorCheck = alias(monitorCheck, "anchor_check");
const anchorIncident = alias(incident, "anchor_incident");

const monitorFields = {
	id: monitor.id,
	name: monitor.name,
	description: monitor.description,
	type: monitor.type,
	active: monitor.active,
	pausedForCapacity: sql<boolean>`${monitor.capacityPausedAt} IS NOT NULL`,
	// A stopped monitor's recorded status is stale, as on the dashboard.
	status: sql<ApiMonitorStatus>`CASE WHEN ${checksStopped} THEN 'not_checked' ELSE COALESCE(${monitorStatus.status}, 'unknown') END`,
	url: monitor.url,
	method: sql<string | null>`CASE WHEN ${monitor.type} = 'http' THEN ${monitor.method} END`,
	hostname: monitor.hostname,
	port: monitor.port,
	intervalSeconds: monitor.intervalSeconds,
	timeoutSeconds: monitor.timeoutSeconds,
	lastCheckAt: monitorStatus.lastCheckAt,
	uptimePercent24h: monitorStatus.uptimePercent24h,
	avgResponseTimeMs24h: monitorStatus.avgResponseTimeMs24h,
	createdAt: monitor.createdAt,
	updatedAt: monitor.updatedAt,
};

const checkFields = {
	id: monitorCheck.id,
	status: monitorCheck.status,
	statusCode: monitorCheck.statusCode,
	responseTimeMs: monitorCheck.responseTimeMs,
	errorMessage: monitorCheck.errorMessage,
	sslExpiresAt: monitorCheck.sslExpiresAt,
	checkedAt: monitorCheck.checkedAt,
};

const incidentFields = {
	id: incident.id,
	title: incident.title,
	status: incident.status,
	impact: incident.impact,
	autoCreated: incident.isAutoCreated,
	startedAt: incident.startedAt,
	resolvedAt: incident.resolvedAt,
	createdAt: incident.createdAt,
	updatedAt: incident.updatedAt,
};

export class ApiReadService {
	private readonly db: Db;

	constructor(database: Db) {
		this.db = database;
	}

	/** Null when the cursor names no monitor in the organization. */
	async listMonitors(organizationId: string, page: PageRequest): Promise<Page<ApiMonitor> | null> {
		let after: SQL | undefined;
		if (page.after) {
			const anchor = this.db
				.select({ createdAt: anchorMonitor.createdAt, id: anchorMonitor.id })
				.from(anchorMonitor)
				.where(
					and(eq(anchorMonitor.id, page.after), eq(anchorMonitor.organizationId, organizationId)),
				);
			if ((await anchor).length === 0) return null;
			after = sql`(${monitor.createdAt}, ${monitor.id}) < (${anchor})`;
		}

		const rows = await this.db
			.select(monitorFields)
			.from(monitor)
			.leftJoin(monitorStatus, eq(monitor.id, monitorStatus.monitorId))
			.where(and(eq(monitor.organizationId, organizationId), after))
			.orderBy(desc(monitor.createdAt), desc(monitor.id))
			.limit(page.limit + 1);
		return toPage(rows, page.limit);
	}

	async getMonitor(organizationId: string, id: string): Promise<ApiMonitor | null> {
		const [row] = await this.db
			.select(monitorFields)
			.from(monitor)
			.leftJoin(monitorStatus, eq(monitor.id, monitorStatus.monitorId))
			.where(and(eq(monitor.id, id), eq(monitor.organizationId, organizationId)));
		return row ?? null;
	}

	/**
	 * Checks of a monitor the caller has already resolved in its organization, newest
	 * first. Null when the cursor names no check of that monitor.
	 */
	async listChecks(monitorId: string, page: PageRequest): Promise<Page<ApiCheck> | null> {
		let after: SQL | undefined;
		if (page.after) {
			const anchor = this.db
				.select({ checkedAt: anchorCheck.checkedAt, id: anchorCheck.id })
				.from(anchorCheck)
				.where(and(eq(anchorCheck.id, page.after), eq(anchorCheck.monitorId, monitorId)));
			if ((await anchor).length === 0) return null;
			after = sql`(${monitorCheck.checkedAt}, ${monitorCheck.id}) < (${anchor})`;
		}

		const rows = await this.db
			.select(checkFields)
			.from(monitorCheck)
			.where(and(eq(monitorCheck.monitorId, monitorId), after))
			.orderBy(desc(monitorCheck.checkedAt), desc(monitorCheck.id))
			.limit(page.limit + 1);
		return toPage(rows, page.limit);
	}

	/** Every incident, resolved or not, newest first. Null on an unknown cursor. */
	async listIncidents(
		organizationId: string,
		page: PageRequest,
	): Promise<Page<ApiIncident> | null> {
		let after: SQL | undefined;
		if (page.after) {
			const anchor = this.db
				.select({ startedAt: anchorIncident.startedAt, id: anchorIncident.id })
				.from(anchorIncident)
				.where(
					and(eq(anchorIncident.id, page.after), eq(anchorIncident.organizationId, organizationId)),
				);
			if ((await anchor).length === 0) return null;
			after = sql`(${incident.startedAt}, ${incident.id}) < (${anchor})`;
		}

		const rows = await this.db
			.select(incidentFields)
			.from(incident)
			.where(and(eq(incident.organizationId, organizationId), after))
			.orderBy(desc(incident.startedAt), desc(incident.id))
			.limit(page.limit + 1);
		return toPage(rows, page.limit);
	}

	async getIncident(organizationId: string, id: string): Promise<ApiIncidentDetail | null> {
		const [row] = await this.db
			.select(incidentFields)
			.from(incident)
			.where(and(eq(incident.id, id), eq(incident.organizationId, organizationId)));
		if (!row) return null;

		const [updates, affectedMonitors] = await Promise.all([
			this.db
				.select({
					id: incidentUpdate.id,
					status: incidentUpdate.status,
					message: incidentUpdate.message,
					createdAt: incidentUpdate.createdAt,
				})
				.from(incidentUpdate)
				.where(eq(incidentUpdate.incidentId, id))
				.orderBy(desc(incidentUpdate.createdAt)),
			this.db
				.select({ id: monitor.id, name: monitor.name })
				.from(monitor)
				.where(
					and(
						eq(monitor.organizationId, organizationId),
						inArray(
							monitor.id,
							this.db
								.select({ id: incidentMonitor.monitorId })
								.from(incidentMonitor)
								.where(eq(incidentMonitor.incidentId, id)),
						),
					),
				),
		]);

		return { ...row, updates, affectedMonitors };
	}
}

export const apiReadService = new ApiReadService(db);
