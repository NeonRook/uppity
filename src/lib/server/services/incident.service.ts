import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { nanoid } from "nanoid";

import { DEFAULT_INCIDENT_STATUS, DEFAULT_INCIDENT_IMPACT } from "#lib/constants/defaults.js";
import type { IncidentImpact, IncidentStatus } from "#lib/constants/status.js";
import { db, type Db } from "#lib/server/db/index.js";
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
		const monitorIds = [...new Set(input.monitorIds)];
		if (!(await monitorsBelongToOrg(this.db, input.organizationId, monitorIds))) {
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

		if (monitorIds.length > 0) {
			await this.db.insert(incidentMonitor).values(
				monitorIds.map((monitorId) => ({
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

		const updates = await this.getUpdates(id);

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

		const isFlippingToResolved = input.status === "resolved" && existing.status !== "resolved";

		const [updated] = await this.db
			.update(incident)
			.set({
				...input,
				updatedAt: new Date(),
				...(isFlippingToResolved && { resolvedAt: new Date() }),
			})
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

		const [updatedIncident] = await this.db
			.update(incident)
			.set({
				status: input.status,
				updatedAt: new Date(),
				...(input.status === "resolved" && { resolvedAt: new Date() }),
			})
			.where(
				and(eq(incident.id, input.incidentId), eq(incident.organizationId, input.organizationId)),
			)
			.returning({ id: incident.id, organizationId: incident.organizationId });

		// A postmortem is post-resolution writing, not paging-worthy, and re-resolving
		// an already-resolved incident must not enqueue a duplicate event.
		const notifiable =
			input.status !== "postmortem" && !(input.status === "resolved" && wasAlreadyResolved);
		if (updatedIncident && notifiable) {
			await this.enqueueIncidentEvent(
				input.status === "resolved" ? "incident_resolved" : "incident_updated",
				updatedIncident,
				{ updateId: id, updateMessage: input.message },
			);
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

	async delete(id: string, organizationId: string): Promise<boolean> {
		const deleted = await this.db
			.delete(incident)
			.where(and(eq(incident.id, id), eq(incident.organizationId, organizationId)))
			.returning({ id: incident.id });

		return deleted.length > 0;
	}
}

export const incidentService = new IncidentService(db);
