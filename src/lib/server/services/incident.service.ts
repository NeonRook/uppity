import { eq, and, desc, inArray, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";

import { DEFAULT_INCIDENT_STATUS, DEFAULT_INCIDENT_IMPACT } from "#lib/constants/defaults.js";
import type { IncidentImpact, IncidentStatus } from "#lib/constants/status.js";
import { db } from "#lib/server/db/index.js";
import * as schema from "#lib/server/db/schema.js";
import {
	incident,
	incidentMonitor,
	incidentUpdate,
	monitor,
	notificationEvent,
	type Incident,
	type IncidentUpdate,
} from "#lib/server/db/schema.js";
import { NotFoundError } from "#lib/server/errors.js";
import type { IncidentEventPayload } from "#lib/server/notifications/events.js";
import { monitorsBelongToOrg } from "#lib/server/services/monitor-ownership.js";

type Db = PostgresJsDatabase<typeof schema>;

export interface CreateIncidentInput {
	organizationId: string;
	title: string;
	status?: IncidentStatus;
	impact?: IncidentImpact;
	message: string;
	monitorIds?: string[];
	createdBy?: string;
	isAutoCreated?: boolean;
}

export interface UpdateIncidentInput {
	title?: string;
	status?: IncidentStatus;
	impact?: IncidentImpact;
}

export interface AddUpdateInput {
	incidentId: string;
	organizationId: string;
	status: IncidentStatus;
	message: string;
	createdBy?: string;
}

export interface IncidentWithDetails extends Incident {
	updates: IncidentUpdate[];
	affectedMonitors: Array<{
		id: string;
		name: string;
		type: string;
	}>;
}

export class IncidentService {
	private db: Db;

	constructor(database: Db) {
		this.db = database;
	}

	private async enqueueIncidentEvent(
		type: "incident_created" | "incident_updated" | "incident_resolved",
		incidentRow: { id: string; organizationId: string },
		updatePayload?: { updateId: string; updateMessage: string },
	): Promise<void> {
		const payload: IncidentEventPayload = updatePayload
			? { updateId: updatePayload.updateId, updateMessage: updatePayload.updateMessage }
			: {};
		await this.db.insert(notificationEvent).values({
			id: nanoid(),
			organizationId: incidentRow.organizationId,
			monitorId: null,
			incidentId: incidentRow.id,
			type,
			payload,
			status: "pending",
		});
	}

	async create(input: CreateIncidentInput): Promise<Incident> {
		if (!(await monitorsBelongToOrg(this.db, input.organizationId, input.monitorIds ?? []))) {
			throw new NotFoundError("Monitor not found");
		}

		const id = nanoid();

		const [newIncident] = await this.db
			.insert(incident)
			.values({
				id,
				organizationId: input.organizationId,
				title: input.title,
				status: input.status || DEFAULT_INCIDENT_STATUS,
				impact: input.impact || DEFAULT_INCIDENT_IMPACT,
				startedAt: new Date(),
				createdBy: input.createdBy,
				isAutoCreated: input.isAutoCreated || false,
			})
			.returning();

		// Link monitors
		if (input.monitorIds && input.monitorIds.length > 0) {
			await this.db.insert(incidentMonitor).values(
				input.monitorIds.map((monitorId) => ({
					incidentId: id,
					monitorId,
				})),
			);
		}

		// Add initial update
		await this.db.insert(incidentUpdate).values({
			id: nanoid(),
			incidentId: id,
			status: input.status || DEFAULT_INCIDENT_STATUS,
			message: input.message,
			createdBy: input.createdBy,
		});

		await this.enqueueIncidentEvent("incident_created", newIncident);

		return newIncident;
	}

	async findById(id: string): Promise<Incident | null> {
		const [result] = await this.db.select().from(incident).where(eq(incident.id, id)).limit(1);

		return result || null;
	}

	async findByIdAndOrg(id: string, organizationId: string): Promise<Incident | null> {
		const [result] = await this.db
			.select()
			.from(incident)
			.where(and(eq(incident.id, id), eq(incident.organizationId, organizationId)))
			.limit(1);

		return result || null;
	}

	async findByOrganization(
		organizationId: string,
		options?: { includeResolved?: boolean },
	): Promise<Incident[]> {
		const conditions = [eq(incident.organizationId, organizationId)];

		if (!options?.includeResolved) {
			conditions.push(ne(incident.status, "resolved"));
		}

		return this.db
			.select()
			.from(incident)
			.where(and(...conditions))
			.orderBy(desc(incident.startedAt));
	}

	async findWithDetails(id: string, organizationId: string): Promise<IncidentWithDetails | null> {
		const inc = await this.findByIdAndOrg(id, organizationId);
		if (!inc) {
			return null;
		}

		// Get updates
		const updates = await this.db
			.select()
			.from(incidentUpdate)
			.where(eq(incidentUpdate.incidentId, id))
			.orderBy(desc(incidentUpdate.createdAt));

		// Get affected monitors
		const affectedMonitorLinks = await this.db
			.select({
				id: monitor.id,
				name: monitor.name,
				type: monitor.type,
			})
			.from(incidentMonitor)
			.innerJoin(
				monitor,
				and(eq(incidentMonitor.monitorId, monitor.id), eq(monitor.organizationId, organizationId)),
			)
			.where(eq(incidentMonitor.incidentId, id));

		return {
			...inc,
			updates,
			affectedMonitors: affectedMonitorLinks,
		};
	}

	async update(
		id: string,
		organizationId: string,
		input: UpdateIncidentInput,
	): Promise<Incident | null> {
		const existing = await this.findByIdAndOrg(id, organizationId);
		if (!existing) {
			return null;
		}

		const updateData: Record<string, unknown> = {
			...input,
			updatedAt: new Date(),
		};

		const isFlippingToResolved = input.status === "resolved" && existing.status !== "resolved";

		if (isFlippingToResolved) {
			updateData.resolvedAt = new Date();
		}

		const [updated] = await this.db
			.update(incident)
			.set(updateData)
			.where(and(eq(incident.id, id), eq(incident.organizationId, organizationId)))
			.returning();

		if (updated && isFlippingToResolved) {
			await this.enqueueIncidentEvent("incident_resolved", updated);
		}

		return updated || null;
	}

	/** Null when the incident is not in `input.organizationId`; nothing is written then. */
	async addUpdate(input: AddUpdateInput): Promise<IncidentUpdate | null> {
		// The prior status tells a real "resolved" transition from re-resolving an
		// already-resolved incident, which must not enqueue a second incident_resolved.
		const previous = await this.findByIdAndOrg(input.incidentId, input.organizationId);
		if (!previous) {
			return null;
		}
		const wasAlreadyResolved = previous.status === "resolved";

		const id = nanoid();

		const [update] = await this.db
			.insert(incidentUpdate)
			.values({
				id,
				incidentId: input.incidentId,
				status: input.status,
				message: input.message,
				createdBy: input.createdBy,
			})
			.returning();

		const updateData: Record<string, unknown> = {
			status: input.status,
			updatedAt: new Date(),
		};

		if (input.status === "resolved") {
			updateData.resolvedAt = new Date();
		}

		const [updatedIncident] = await this.db
			.update(incident)
			.set(updateData)
			.where(
				and(eq(incident.id, input.incidentId), eq(incident.organizationId, input.organizationId)),
			)
			.returning({ id: incident.id, organizationId: incident.organizationId });

		// A postmortem is post-resolution writing, not paging-worthy.
		if (updatedIncident && input.status !== "postmortem") {
			if (input.status === "resolved") {
				if (!wasAlreadyResolved) {
					await this.enqueueIncidentEvent("incident_resolved", updatedIncident, {
						updateId: id,
						updateMessage: input.message,
					});
				}
				// Re-resolving an already-resolved incident → no notification fires.
			} else {
				await this.enqueueIncidentEvent("incident_updated", updatedIncident, {
					updateId: id,
					updateMessage: input.message,
				});
			}
		}

		return update;
	}

	async getUpdates(incidentId: string): Promise<IncidentUpdate[]> {
		return this.db
			.select()
			.from(incidentUpdate)
			.where(eq(incidentUpdate.incidentId, incidentId))
			.orderBy(desc(incidentUpdate.createdAt));
	}

	/** Rewrites the postmortem `updateId` only if it belongs to an incident in `organizationId`. */
	async updatePostmortem(
		incidentId: string,
		organizationId: string,
		updateId: string,
		message: string,
	): Promise<IncidentUpdate | null> {
		const ownedIncident = this.db
			.select({ id: incident.id })
			.from(incident)
			.where(and(eq(incident.id, incidentId), eq(incident.organizationId, organizationId)));

		const [updated] = await this.db
			.update(incidentUpdate)
			.set({ message })
			.where(
				and(
					eq(incidentUpdate.id, updateId),
					eq(incidentUpdate.status, "postmortem"),
					inArray(incidentUpdate.incidentId, ownedIncident),
				),
			)
			.returning();

		return updated || null;
	}

	async getAffectedMonitors(incidentId: string): Promise<
		Array<{
			id: string;
			name: string;
			type: string;
		}>
	> {
		return this.db
			.select({
				id: monitor.id,
				name: monitor.name,
				type: monitor.type,
			})
			.from(incidentMonitor)
			.innerJoin(monitor, eq(incidentMonitor.monitorId, monitor.id))
			.where(eq(incidentMonitor.incidentId, incidentId));
	}

	async delete(id: string, organizationId: string): Promise<boolean> {
		const existing = await this.findByIdAndOrg(id, organizationId);
		if (!existing) {
			return false;
		}

		await this.db
			.delete(incident)
			.where(and(eq(incident.id, id), eq(incident.organizationId, organizationId)));

		return true;
	}

	// Get active incidents for a set of monitors
	async getActiveIncidentsForMonitors(monitorIds: string[]): Promise<Incident[]> {
		if (monitorIds.length === 0) return [];

		const incidentIds = await this.db
			.selectDistinct({ incidentId: incidentMonitor.incidentId })
			.from(incidentMonitor)
			.where(inArray(incidentMonitor.monitorId, monitorIds));

		if (incidentIds.length === 0) return [];

		return this.db
			.select()
			.from(incident)
			.where(
				and(
					inArray(
						incident.id,
						incidentIds.map((i) => i.incidentId),
					),
					ne(incident.status, "resolved"),
				),
			)
			.orderBy(desc(incident.startedAt));
	}

	// Get active auto-created incident for a specific monitor
	async getActiveAutoIncidentForMonitor(monitorId: string): Promise<Incident | null> {
		const incidentIds = await this.db
			.select({ incidentId: incidentMonitor.incidentId })
			.from(incidentMonitor)
			.where(eq(incidentMonitor.monitorId, monitorId));

		if (incidentIds.length === 0) return null;

		const [result] = await this.db
			.select()
			.from(incident)
			.where(
				and(
					inArray(
						incident.id,
						incidentIds.map((i) => i.incidentId),
					),
					ne(incident.status, "resolved"),
					eq(incident.isAutoCreated, true),
				),
			)
			.orderBy(desc(incident.startedAt))
			.limit(1);

		return result || null;
	}
}

export const incidentService = new IncidentService(db);
