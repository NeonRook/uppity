import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import {
	maintenanceWindow,
	maintenanceWindowMonitor,
	monitor,
	type MaintenanceWindow,
} from "$lib/server/db/schema";
import { eq, and, lte, gte, inArray, sql, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";

type Db = PostgresJsDatabase<typeof schema>;

export type MaintenanceWindowStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface CreateMaintenanceWindowInput {
	organizationId: string;
	name: string;
	description?: string;
	startsAt: Date;
	endsAt: Date;
	monitorIds: string[];
	createdBy?: string;
}

export interface UpdateMaintenanceWindowInput {
	name?: string;
	description?: string;
	startsAt?: Date;
	endsAt?: Date;
	monitorIds?: string[];
}

export interface MaintenanceWindowWithMonitors extends MaintenanceWindow {
	monitorIds: string[];
}

export interface MaintenanceWindowSummary extends MaintenanceWindow {
	monitorCount: number;
}

export class MaintenanceWindowService {
	private db: Db;

	constructor(database: Db) {
		this.db = database;
	}

	private async assertMonitorsBelongToOrg(orgId: string, monitorIds: string[]): Promise<void> {
		const uniqueMonitorIds = Array.from(new Set(monitorIds));
		const found = await this.db
			.select({ id: monitor.id })
			.from(monitor)
			.where(and(eq(monitor.organizationId, orgId), inArray(monitor.id, uniqueMonitorIds)));
		if (found.length !== uniqueMonitorIds.length) {
			throw new Error("Monitor not found");
		}
	}

	async create(input: CreateMaintenanceWindowInput): Promise<MaintenanceWindow> {
		if (input.name.trim().length < 1) {
			throw new Error("Name is required");
		}
		if (input.endsAt <= input.startsAt) {
			throw new Error("End time must be after start time");
		}
		if (input.endsAt <= new Date()) {
			throw new Error("End time must be in the future");
		}
		if (input.monitorIds.length < 1) {
			throw new Error("Select at least one monitor");
		}

		const uniqueMonitorIds = Array.from(new Set(input.monitorIds));
		await this.assertMonitorsBelongToOrg(input.organizationId, uniqueMonitorIds);

		const id = nanoid();
		const [created] = await this.db
			.insert(maintenanceWindow)
			.values({
				id,
				organizationId: input.organizationId,
				name: input.name.trim(),
				description: input.description,
				status: "scheduled",
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				createdBy: input.createdBy,
			})
			.returning();

		await this.db
			.insert(maintenanceWindowMonitor)
			.values(uniqueMonitorIds.map((monitorId) => ({ windowId: id, monitorId })));

		return created;
	}

	async update(
		id: string,
		orgId: string,
		input: UpdateMaintenanceWindowInput,
	): Promise<MaintenanceWindow> {
		return await this.db.transaction(async (tx) => {
			const [existing] = await tx
				.select()
				.from(maintenanceWindow)
				.where(and(eq(maintenanceWindow.id, id), eq(maintenanceWindow.organizationId, orgId)))
				.limit(1);
			if (!existing) {
				throw new Error("Maintenance window not found");
			}

			const resolvedStart = input.startsAt ?? existing.startsAt;
			const resolvedEnd = input.endsAt ?? existing.endsAt;
			if (resolvedEnd <= resolvedStart) {
				throw new Error("End time must be after start time");
			}

			if (input.name !== undefined && input.name.trim().length < 1) {
				throw new Error("Name is required");
			}

			let uniqueMonitorIds: string[] | undefined;
			if (input.monitorIds !== undefined) {
				if (input.monitorIds.length < 1) {
					throw new Error("Select at least one monitor");
				}
				uniqueMonitorIds = Array.from(new Set(input.monitorIds));
				const found = await tx
					.select({ id: monitor.id })
					.from(monitor)
					.where(and(eq(monitor.organizationId, orgId), inArray(monitor.id, uniqueMonitorIds)));
				if (found.length !== uniqueMonitorIds.length) {
					throw new Error("Monitor not found");
				}
			}

			const updateData: Partial<typeof maintenanceWindow.$inferInsert> = {
				updatedAt: new Date(),
			};
			if (input.name !== undefined) updateData.name = input.name.trim();
			if (input.description !== undefined) updateData.description = input.description;
			if (input.startsAt !== undefined) updateData.startsAt = input.startsAt;
			if (input.endsAt !== undefined) updateData.endsAt = input.endsAt;

			const [updated] = await tx
				.update(maintenanceWindow)
				.set(updateData)
				.where(and(eq(maintenanceWindow.id, id), eq(maintenanceWindow.organizationId, orgId)))
				.returning();

			if (uniqueMonitorIds !== undefined) {
				await tx.delete(maintenanceWindowMonitor).where(eq(maintenanceWindowMonitor.windowId, id));
				await tx
					.insert(maintenanceWindowMonitor)
					.values(uniqueMonitorIds.map((monitorId) => ({ windowId: id, monitorId })));
			}

			return updated;
		});
	}

	async cancel(id: string, orgId: string): Promise<MaintenanceWindow> {
		const [existing] = await this.db
			.select()
			.from(maintenanceWindow)
			.where(and(eq(maintenanceWindow.id, id), eq(maintenanceWindow.organizationId, orgId)))
			.limit(1);
		if (!existing) {
			throw new Error("Maintenance window not found");
		}
		if (existing.status === "completed") {
			throw new Error("Cannot cancel a completed window");
		}
		if (existing.status === "cancelled") {
			return existing;
		}

		const [updated] = await this.db
			.update(maintenanceWindow)
			.set({ status: "cancelled", updatedAt: new Date() })
			.where(and(eq(maintenanceWindow.id, id), eq(maintenanceWindow.organizationId, orgId)))
			.returning();
		return updated;
	}

	async delete(id: string, orgId: string): Promise<void> {
		await this.db
			.delete(maintenanceWindow)
			.where(and(eq(maintenanceWindow.id, id), eq(maintenanceWindow.organizationId, orgId)));
	}

	async findById(id: string, orgId: string): Promise<MaintenanceWindowWithMonitors | null> {
		const [row] = await this.db
			.select()
			.from(maintenanceWindow)
			.where(and(eq(maintenanceWindow.id, id), eq(maintenanceWindow.organizationId, orgId)))
			.limit(1);
		if (!row) return null;

		const links = await this.db
			.select({ monitorId: maintenanceWindowMonitor.monitorId })
			.from(maintenanceWindowMonitor)
			.where(eq(maintenanceWindowMonitor.windowId, id));

		return { ...row, monitorIds: links.map((l) => l.monitorId) };
	}

	async listByOrg(
		orgId: string,
		filter?: { status?: MaintenanceWindowStatus[] },
	): Promise<MaintenanceWindowSummary[]> {
		const conditions = [eq(maintenanceWindow.organizationId, orgId)];
		if (filter?.status && filter.status.length > 0) {
			conditions.push(inArray(maintenanceWindow.status, filter.status));
		}

		const rows = await this.db
			.select({
				window: maintenanceWindow,
				monitorCount: sql<number>`count(${maintenanceWindowMonitor.monitorId})::int`,
			})
			.from(maintenanceWindow)
			.leftJoin(
				maintenanceWindowMonitor,
				eq(maintenanceWindowMonitor.windowId, maintenanceWindow.id),
			)
			.where(and(...conditions))
			.groupBy(maintenanceWindow.id)
			.orderBy(desc(maintenanceWindow.startsAt));

		return rows.map((r) => Object.assign(r.window, { monitorCount: r.monitorCount }));
	}

	async findActiveForMonitor(monitorId: string, at?: Date): Promise<MaintenanceWindow | null> {
		const now = at ?? new Date();
		const [row] = await this.db
			.select({ window: maintenanceWindow })
			.from(maintenanceWindow)
			.innerJoin(
				maintenanceWindowMonitor,
				eq(maintenanceWindowMonitor.windowId, maintenanceWindow.id),
			)
			.where(
				and(
					eq(maintenanceWindowMonitor.monitorId, monitorId),
					eq(maintenanceWindow.status, "in_progress"),
					lte(maintenanceWindow.startsAt, now),
					gte(maintenanceWindow.endsAt, now),
				),
			)
			.limit(1);
		return row?.window ?? null;
	}

	async findActiveMonitorIds(at?: Date): Promise<Set<string>> {
		const now = at ?? new Date();
		const rows = await this.db
			.selectDistinct({ monitorId: maintenanceWindowMonitor.monitorId })
			.from(maintenanceWindowMonitor)
			.innerJoin(maintenanceWindow, eq(maintenanceWindow.id, maintenanceWindowMonitor.windowId))
			.where(
				and(
					eq(maintenanceWindow.status, "in_progress"),
					lte(maintenanceWindow.startsAt, now),
					gte(maintenanceWindow.endsAt, now),
				),
			);
		return new Set(rows.map((r) => r.monitorId));
	}

	async runStatusTransitions(at?: Date): Promise<{ started: number; completed: number }> {
		const now = at ?? new Date();
		return await this.db.transaction(async (tx) => {
			const started = await tx
				.update(maintenanceWindow)
				.set({ status: "in_progress", updatedAt: new Date() })
				.where(and(eq(maintenanceWindow.status, "scheduled"), lte(maintenanceWindow.startsAt, now)))
				.returning({ id: maintenanceWindow.id });
			const completed = await tx
				.update(maintenanceWindow)
				.set({ status: "completed", updatedAt: new Date() })
				.where(and(eq(maintenanceWindow.status, "in_progress"), lte(maintenanceWindow.endsAt, now)))
				.returning({ id: maintenanceWindow.id });
			return { started: started.length, completed: completed.length };
		});
	}
}

export const maintenanceWindowService = new MaintenanceWindowService(db);
