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
import { CHECK_RETRY } from "$lib/constants/worker";
import { db } from "$lib/server/db";
import { monitor, monitorStatus, type Monitor } from "$lib/server/db/schema";
import { SubscriptionLimitError } from "$lib/server/errors";
import { meterService } from "$lib/server/services/meter.service";
import { subscriptionService } from "$lib/server/services/subscription.service";
import { eq, and, desc, gte, sql } from "drizzle-orm";
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
		// Check subscription limits before creating
		const limitCheck = await subscriptionService.canAddMonitor(input.organizationId);
		if (!limitCheck.allowed) {
			throw new SubscriptionLimitError(limitCheck.message ?? "Monitor limit reached", {
				limit: limitCheck.limit,
				currentUsage: limitCheck.currentUsage,
			});
		}

		// Check if the requested interval is allowed
		const intervalSeconds = input.intervalSeconds || DEFAULT_INTERVAL_SECONDS;
		const intervalCheck = await subscriptionService.isCheckIntervalAllowed(
			input.organizationId,
			intervalSeconds,
		);
		if (!intervalCheck.allowed) {
			throw new SubscriptionLimitError(intervalCheck.message ?? "Check interval not allowed", {
				limit: intervalCheck.limit,
			});
		}

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
				nextCheckAt: new Date(),
			})
			.returning();

		// Initialize monitor status
		await db.insert(monitorStatus).values({
			monitorId: id,
			status: "unknown",
			consecutiveFailures: 0,
		});

		// Report meter event (non-blocking)
		void meterService.monitorCreated(input.organizationId, id, newMonitor.type);

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

		// Check if the new interval is allowed (if being changed)
		if (input.intervalSeconds !== undefined) {
			const intervalCheck = await subscriptionService.isCheckIntervalAllowed(
				organizationId,
				input.intervalSeconds,
			);
			if (!intervalCheck.allowed) {
				throw new SubscriptionLimitError(intervalCheck.message ?? "Check interval not allowed", {
					limit: intervalCheck.limit,
				});
			}
		}

		// If activating or changing interval, reset the schedule
		const shouldResetSchedule =
			(input.active === true && !existingMonitor.active) ||
			(input.intervalSeconds !== undefined &&
				input.intervalSeconds !== existingMonitor.intervalSeconds);

		const [updated] = await db
			.update(monitor)
			.set({
				...input,
				updatedAt: new Date(),
				// Reset schedule if becoming active or interval changed
				...(shouldResetSchedule && {
					nextCheckAt: sql`NOW()`,
					checkRetryCount: 0,
					checkLastError: null,
					checkBackoffUntil: null,
				}),
			})
			.where(and(eq(monitor.id, id), eq(monitor.organizationId, organizationId)))
			.returning();

		return updated || null;
	}

	async delete(id: string, organizationId: string): Promise<boolean> {
		const existingMonitor = await this.findByIdAndOrg(id, organizationId);
		if (!existingMonitor) {
			return false;
		}

		await db
			.delete(monitor)
			.where(and(eq(monitor.id, id), eq(monitor.organizationId, organizationId)));

		// Report meter event (non-blocking)
		void meterService.monitorDeleted(organizationId, id);

		return true;
	}

	async toggleActive(id: string, organizationId: string): Promise<Monitor | null> {
		const existingMonitor = await this.findByIdAndOrg(id, organizationId);
		if (!existingMonitor) {
			return null;
		}

		return this.update(id, organizationId, { active: !existingMonitor.active });
	}

	/**
	 * Returns monitors that have exceeded the max retry count (dead letter state).
	 */
	async findDeadLetterMonitors(organizationId: string): Promise<Monitor[]> {
		return db
			.select()
			.from(monitor)
			.where(
				and(
					eq(monitor.organizationId, organizationId),
					gte(monitor.checkRetryCount, CHECK_RETRY.MAX_ATTEMPTS),
				),
			)
			.orderBy(desc(monitor.updatedAt));
	}

	/**
	 * Resets a monitor from dead letter state, allowing it to be checked again.
	 */
	async resetDeadLetter(id: string, organizationId: string): Promise<Monitor | null> {
		const existingMonitor = await this.findByIdAndOrg(id, organizationId);
		if (!existingMonitor) {
			return null;
		}

		const [updated] = await db
			.update(monitor)
			.set({
				checkRetryCount: 0,
				checkLastError: null,
				checkBackoffUntil: null,
				nextCheckAt: sql`NOW()`,
				updatedAt: new Date(),
			})
			.where(and(eq(monitor.id, id), eq(monitor.organizationId, organizationId)))
			.returning();

		return updated || null;
	}
}

export const monitorService = new MonitorService();
