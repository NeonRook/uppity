import {
	DEFAULT_TIMEOUT_SECONDS,
	DEFAULT_INTERVAL_SECONDS,
	DEFAULT_RETRIES,
	DEFAULT_ALERT_AFTER_FAILURES,
	DEFAULT_PUSH_GRACE_PERIOD_SECONDS,
	DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS,
	DEFAULT_HTTP_METHOD,
	DEFAULT_EXPECTED_STATUS_CODES,
	PUSH_TOKEN_LENGTH,
} from "$lib/constants/defaults";
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
				method: input.method || DEFAULT_HTTP_METHOD,
				headers: input.headers,
				body: input.body,
				expectedStatusCodes: input.expectedStatusCodes || [...DEFAULT_EXPECTED_STATUS_CODES],
				expectedBodyContains: input.expectedBodyContains,
				hostname: input.hostname,
				port: input.port,
				intervalSeconds: input.intervalSeconds || DEFAULT_INTERVAL_SECONDS,
				timeoutSeconds: input.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS,
				retries: input.retries ?? DEFAULT_RETRIES,
				sslCheckEnabled: input.sslCheckEnabled ?? true,
				sslExpiryThresholdDays: input.sslExpiryThresholdDays || DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS,
				alertAfterFailures: input.alertAfterFailures || DEFAULT_ALERT_AFTER_FAILURES,
				pushToken: input.type === "push" ? nanoid(PUSH_TOKEN_LENGTH) : null,
				pushGracePeriodSeconds: input.pushGracePeriodSeconds || DEFAULT_PUSH_GRACE_PERIOD_SECONDS,
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
