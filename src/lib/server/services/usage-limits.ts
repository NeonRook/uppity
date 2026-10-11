import { and, count, eq, isNotNull } from "drizzle-orm";

import { db } from "#lib/server/db/index.js";
import { monitor } from "#lib/server/db/schema.js";

import { pauseDate } from "./capacity.service";
import { subscriptionService } from "./subscription.instance";

/**
 * Usage limits data to be passed to the UI.
 * This allows the frontend to disable buttons when limits are reached.
 */
export interface UsageLimitsData {
	plan: {
		id: string;
		name: string;
	};
	monitors: {
		current: number;
		limit: number; // -1 for unlimited
		canAdd: boolean;
	};
	statusPages: {
		current: number;
		limit: number; // -1 for unlimited
		canAdd: boolean;
	};
	features: {
		customDomains: boolean;
		notificationChannels: ("email" | "slack" | "discord" | "webhook")[];
		minCheckIntervalSeconds: number;
	};
	capacity: {
		/** When the newest monitors get paused; null until the grace period has started. */
		pauseAt: Date | null;
		/** Monitors paused because the organization went over its ceiling. */
		paused: number;
	};
}

/**
 * Gets usage limits data for an organization.
 * Call this in page load functions where you need to show/hide UI based on limits.
 */
export async function getUsageLimitsData(organizationId: string): Promise<UsageLimitsData> {
	const [plan, usage, limits, sub, [capacityPaused]] = await Promise.all([
		subscriptionService.getOrganizationPlan(organizationId),
		subscriptionService.getUsage(organizationId),
		subscriptionService.getEffectiveLimits(organizationId),
		subscriptionService.getSubscription(organizationId),
		db
			.select({ count: count() })
			.from(monitor)
			.where(and(eq(monitor.organizationId, organizationId), isNotNull(monitor.capacityPausedAt))),
	]);

	return {
		plan: {
			id: plan.id,
			name: plan.name,
		},
		monitors: {
			current: usage.monitors,
			limit: limits.monitors,
			canAdd: limits.monitors === -1 || usage.monitors < limits.monitors,
		},
		statusPages: {
			current: usage.statusPages,
			limit: limits.statusPages,
			canAdd: limits.statusPages === -1 || usage.statusPages < limits.statusPages,
		},
		features: {
			customDomains: limits.customDomains,
			notificationChannels: [...limits.notificationChannels],
			minCheckIntervalSeconds: limits.checkIntervalSeconds,
		},
		capacity: {
			pauseAt: sub?.overCapacitySince ? pauseDate(sub.overCapacitySince) : null,
			paused: capacityPaused?.count ?? 0,
		},
	};
}
