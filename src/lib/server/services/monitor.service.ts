import { eq, and, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

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
} from "#lib/constants/defaults.js";
import { db, type DbExecutor } from "#lib/server/db/index.js";
import { monitor, monitorStatus, type Monitor } from "#lib/server/db/schema.js";
import { SubscriptionLimitError } from "#lib/server/errors.js";
import { clearIfWithinCeiling } from "#lib/server/services/capacity.service.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

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
		// Check if the requested interval is allowed
		const intervalSeconds = input.intervalSeconds || DEFAULT_INTERVAL_SECONDS;
		const intervalCheck = await subscriptionService.isCheckIntervalAllowed(
			input.organizationId,
			intervalSeconds,
		);
		if (!intervalCheck.allowed) {
			throw new SubscriptionLimitError(intervalCheck.message ?? "Check interval not allowed");
		}

		const id = nanoid();

		const slot = await subscriptionService.takeMonitorSlot(input.organizationId, async (tx) => {
			const [created] = await tx
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

			await tx.insert(monitorStatus).values({
				monitorId: id,
				status: "unknown",
				consecutiveFailures: 0,
			});

			return created;
		});
		if (!slot.ok) {
			throw new SubscriptionLimitError(
				`You've reached the limit of ${slot.limit} active monitors on your current plan. Upgrade to add more.`,
			);
		}

		return slot.value;
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
				throw new SubscriptionLimitError(intervalCheck.message ?? "Check interval not allowed");
			}
		}

		const resuming = input.active === true && !existingMonitor.active;

		// If activating or changing interval, reset the schedule
		const shouldResetSchedule =
			resuming ||
			(input.intervalSeconds !== undefined &&
				input.intervalSeconds !== existingMonitor.intervalSeconds);

		const write = async (executor: DbExecutor) => {
			const [row] = await executor
				.update(monitor)
				.set({
					...input,
					updatedAt: new Date(),
					...(resuming && { capacityPausedAt: null }),
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
			return row;
		};

		if (!resuming) {
			const written = (await write(db)) ?? null;
			if (input.active === false) await clearIfWithinCeiling(db, organizationId);
			return written;
		}

		// Paused monitors sit outside the ceiling, so resuming one takes a slot.
		const slot = await subscriptionService.takeMonitorSlot(organizationId, write);
		if (!slot.ok) {
			throw new SubscriptionLimitError(
				`You've reached the limit of ${slot.limit} active monitors on your current plan. Pause another monitor or add capacity to resume this one.`,
			);
		}
		const updated = slot.value;

		return updated || null;
	}

	async delete(id: string, organizationId: string): Promise<boolean> {
		const deleted = await db
			.delete(monitor)
			.where(and(eq(monitor.id, id), eq(monitor.organizationId, organizationId)))
			.returning({ id: monitor.id });
		if (deleted.length === 0) return false;

		await clearIfWithinCeiling(db, organizationId);
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
