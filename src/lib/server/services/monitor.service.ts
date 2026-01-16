import { db } from "$lib/server/db";
import { monitor, monitorStatus, type Monitor } from "$lib/server/db/schema";
import { scheduler } from "$lib/server/jobs/scheduler";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export interface CreateMonitorInput {
	organizationId: string;
	name: string;
	description?: string;
	type?: "http" | "tcp" | "push";
	url?: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	expectedStatusCodes?: number[];
	expectedBodyContains?: string;
	hostname?: string;
	port?: number;
	intervalSeconds?: number;
	timeoutSeconds?: number;
	retries?: number;
	sslCheckEnabled?: boolean;
	sslExpiryThresholdDays?: number;
	alertAfterFailures?: number;
	pushGracePeriodSeconds?: number;
}

export interface UpdateMonitorInput extends Partial<Omit<CreateMonitorInput, "organizationId">> {
	active?: boolean;
}

export class MonitorService {
	async create(input: CreateMonitorInput): Promise<Monitor> {
		const id = nanoid();

		const [newMonitor] = await db
			.insert(monitor)
			.values({
				id,
				organizationId: input.organizationId,
				name: input.name,
				description: input.description,
				type: input.type || "http",
				url: input.url,
				method: input.method || "GET",
				headers: input.headers,
				body: input.body,
				expectedStatusCodes: input.expectedStatusCodes || [200],
				expectedBodyContains: input.expectedBodyContains,
				hostname: input.hostname,
				port: input.port,
				intervalSeconds: input.intervalSeconds || 60,
				timeoutSeconds: input.timeoutSeconds || 30,
				retries: input.retries || 0,
				sslCheckEnabled: input.sslCheckEnabled ?? true,
				sslExpiryThresholdDays: input.sslExpiryThresholdDays || 14,
				alertAfterFailures: input.alertAfterFailures || 1,
				pushToken: input.type === "push" ? nanoid(32) : null,
				pushGracePeriodSeconds: input.pushGracePeriodSeconds || 60,
			})
			.returning();

		// Initialize monitor status
		await db.insert(monitorStatus).values({
			monitorId: id,
			status: "unknown",
			consecutiveFailures: 0,
		});

		// Schedule the new monitor for health checks
		scheduler.scheduleMonitor(newMonitor);

		return newMonitor;
	}

	async findById(id: string): Promise<Monitor | null> {
		const [result] = await db.select().from(monitor).where(eq(monitor.id, id)).limit(1);

		return result || null;
	}

	async findByIdAndOrg(id: string, organizationId: string): Promise<Monitor | null> {
		const [result] = await db
			.select()
			.from(monitor)
			.where(and(eq(monitor.id, id), eq(monitor.organizationId, organizationId)))
			.limit(1);

		return result || null;
	}

	async findByOrganization(organizationId: string): Promise<Monitor[]> {
		return db
			.select()
			.from(monitor)
			.where(eq(monitor.organizationId, organizationId))
			.orderBy(desc(monitor.createdAt));
	}

	async findActiveMonitors(): Promise<Monitor[]> {
		return db.select().from(monitor).where(eq(monitor.active, true));
	}

	async update(
		id: string,
		organizationId: string,
		input: UpdateMonitorInput,
	): Promise<Monitor | null> {
		const existingMonitor = await this.findByIdAndOrg(id, organizationId);
		if (!existingMonitor) {
			return null;
		}

		const [updated] = await db
			.update(monitor)
			.set({
				...input,
				updatedAt: new Date(),
			})
			.where(and(eq(monitor.id, id), eq(monitor.organizationId, organizationId)))
			.returning();

		// Reschedule the monitor (handles active state changes)
		if (updated) {
			scheduler.scheduleMonitor(updated);
		}

		return updated || null;
	}

	async delete(id: string, organizationId: string): Promise<boolean> {
		const existingMonitor = await this.findByIdAndOrg(id, organizationId);
		if (!existingMonitor) {
			return false;
		}

		// Unschedule the monitor first
		scheduler.unscheduleMonitor(id);

		await db
			.delete(monitor)
			.where(and(eq(monitor.id, id), eq(monitor.organizationId, organizationId)));

		return true;
	}

	async toggleActive(id: string, organizationId: string): Promise<Monitor | null> {
		const existingMonitor = await this.findByIdAndOrg(id, organizationId);
		if (!existingMonitor) {
			return null;
		}

		return this.update(id, organizationId, { active: !existingMonitor.active });
	}
}

export const monitorService = new MonitorService();
