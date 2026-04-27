import {
	DEFAULT_INCIDENT_STATUS,
	DEFAULT_INCIDENT_IMPACT,
	AUTO_RESOLVE_MESSAGE,
} from "$lib/constants/defaults";
import type { IncidentImpact, IncidentStatus } from "$lib/constants/status";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import {
	incident,
	incidentMonitor,
	incidentUpdate,
	monitor,
	notificationEvent,
	type Incident,
	type IncidentUpdate,
} from "$lib/server/db/schema";
import type { IncidentEventPayload } from "$lib/server/notifications/events";
import { eq, and, desc, inArray, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";

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
	status: IncidentStatus;
	message: string;
	createdBy?: string;
	suppressNotification?: boolean;
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
			.innerJoin(monitor, eq(incidentMonitor.monitorId, monitor.id))
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

	async addUpdate(input: AddUpdateInput): Promise<IncidentUpdate> {
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

		// Read prior status before the UPDATE so we can tell a real "resolved"
		// transition from re-resolving an already-resolved incident — the latter
		// would otherwise enqueue duplicate incident_resolved events on repeat
		// submission.
		const [previous] = await this.db
			.select({ status: incident.status })
			.from(incident)
			.where(eq(incident.id, input.incidentId))
			.limit(1);
		const wasAlreadyResolved = previous?.status === "resolved";

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
			.where(eq(incident.id, input.incidentId))
			.returning({ id: incident.id, organizationId: incident.organizationId });

		// Enqueue notification unless explicitly suppressed (autoResolveIncident path)
		// or this is a postmortem (post-resolution writing, not paging-worthy).
		if (updatedIncident && !input.suppressNotification && input.status !== "postmortem") {
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

	async updateIncidentUpdate(updateId: string, message: string): Promise<IncidentUpdate | null> {
		const [updated] = await this.db
			.update(incidentUpdate)
			.set({ message })
			.where(eq(incidentUpdate.id, updateId))
			.returning();

		return updated || null;
	}

	async linkMonitors(incidentId: string, monitorIds: string[]): Promise<void> {
		if (monitorIds.length === 0) return;

		await this.db
			.insert(incidentMonitor)
			.values(
				monitorIds.map((monitorId) => ({
					incidentId,
					monitorId,
				})),
			)
			.onConflictDoNothing();
	}

	async unlinkMonitor(incidentId: string, monitorId: string): Promise<void> {
		await this.db
			.delete(incidentMonitor)
			.where(
				and(eq(incidentMonitor.incidentId, incidentId), eq(incidentMonitor.monitorId, monitorId)),
			);
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

	// Auto-resolve incident when monitor recovers
	async autoResolveIncident(incidentId: string): Promise<void> {
		await this.addUpdate({
			incidentId,
			status: "resolved",
			message: AUTO_RESOLVE_MESSAGE,
			suppressNotification: true,
		});
	}
}

export const incidentService = new IncidentService(db);
