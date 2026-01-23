import { subscriptionService } from "./subscription.service";

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
}

/**
 * Gets usage limits data for an organization.
 * Call this in page load functions where you need to show/hide UI based on limits.
 */
export async function getUsageLimitsData(organizationId: string): Promise<UsageLimitsData> {
	const [plan, usage, limits] = await Promise.all([
		subscriptionService.getOrganizationPlan(organizationId),
		subscriptionService.getUsage(organizationId),
		subscriptionService.getEffectiveLimits(organizationId),
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
	};
}

/**
 * Formats a limit for display (handles -1 as "Unlimited").
 */
export function formatLimit(limit: number): string {
	return limit === -1 ? "Unlimited" : String(limit);
}

/**
 * Calculates usage percentage for progress bars.
 */
export function getUsagePercentage(current: number, limit: number): number {
	if (limit === -1) return 0;
	return Math.min(100, Math.round((current / limit) * 100));
}
