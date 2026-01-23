import { USAGE_THRESHOLDS } from "$lib/constants/plans";
import { db } from "$lib/server/db";
import { usageWarning } from "$lib/server/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { nanoid } from "nanoid";

import { subscriptionService, isSelfHosted } from "./subscription.service";

export type LimitedResourceType = "monitors" | "statusPages";

export interface UsageCheckResult {
	allowed: boolean;
	currentUsage: number;
	limit: number;
	percentage: number;
	message?: string;
	shouldWarn: boolean;
}

export class UsageService {
	/**
	 * Checks usage for a resource and returns whether the action is allowed.
	 * Also determines if a warning should be sent.
	 */
	async checkUsage(
		organizationId: string,
		resource: LimitedResourceType,
	): Promise<UsageCheckResult> {
		// Self-hosted mode bypasses all limits
		if (isSelfHosted()) {
			const usage = await subscriptionService.getUsage(organizationId);
			return {
				allowed: true,
				currentUsage: usage[resource],
				limit: -1,
				percentage: 0,
				shouldWarn: false,
			};
		}

		const limits = await subscriptionService.getEffectiveLimits(organizationId);
		const usage = await subscriptionService.getUsage(organizationId);

		const currentUsage = usage[resource];
		const limit = limits[resource];

		// -1 means unlimited
		if (limit === -1) {
			return {
				allowed: true,
				currentUsage,
				limit: -1,
				percentage: 0,
				shouldWarn: false,
			};
		}

		const percentage = (currentUsage / limit) * 100;
		const allowed = percentage < USAGE_THRESHOLDS.LIMIT;

		// Check if we should send a warning (at 80% threshold)
		const shouldWarn =
			percentage >= USAGE_THRESHOLDS.WARNING && percentage < USAGE_THRESHOLDS.LIMIT;

		return {
			allowed,
			currentUsage,
			limit,
			percentage,
			message: this.buildUsageMessage(resource, currentUsage, limit, percentage),
			shouldWarn,
		};
	}

	/**
	 * Records that a usage warning was sent for a resource.
	 */
	async recordWarning(
		organizationId: string,
		resource: LimitedResourceType,
		warningLevel: number,
	): Promise<void> {
		await db.insert(usageWarning).values({
			id: nanoid(),
			organizationId,
			resourceType: resource,
			warningLevel,
		});
	}

	/**
	 * Checks if a warning was recently sent for this resource.
	 * "Recent" is defined as within the last 24 hours.
	 */
	async hasRecentWarning(
		organizationId: string,
		resource: LimitedResourceType,
		warningLevel: number,
	): Promise<boolean> {
		const oneDayAgo = new Date();
		oneDayAgo.setDate(oneDayAgo.getDate() - 1);

		const [result] = await db
			.select()
			.from(usageWarning)
			.where(
				and(
					eq(usageWarning.organizationId, organizationId),
					eq(usageWarning.resourceType, resource),
					eq(usageWarning.warningLevel, warningLevel),
					gte(usageWarning.sentAt, oneDayAgo),
				),
			)
			.limit(1);

		return !!result;
	}

	/**
	 * Checks usage and sends a warning notification if needed.
	 * Returns the check result and whether a warning was sent.
	 */
	async checkUsageAndNotify(
		organizationId: string,
		resource: LimitedResourceType,
	): Promise<UsageCheckResult & { warningSent: boolean }> {
		const result = await this.checkUsage(organizationId, resource);

		let warningSent = false;

		if (result.shouldWarn) {
			const hasRecent = await this.hasRecentWarning(
				organizationId,
				resource,
				USAGE_THRESHOLDS.WARNING,
			);

			if (!hasRecent) {
				// Record the warning (notification sending would be triggered here)
				await this.recordWarning(organizationId, resource, USAGE_THRESHOLDS.WARNING);
				warningSent = true;
				// TODO: Trigger actual notification via notification service
				// This would send an email/in-app notification about approaching limits
			}
		}

		return { ...result, warningSent };
	}

	/**
	 * Gets a summary of usage for all limited resources.
	 */
	async getUsageSummary(organizationId: string): Promise<{
		monitors: UsageCheckResult;
		statusPages: UsageCheckResult;
		plan: {
			id: string;
			name: string;
		};
	}> {
		const plan = await subscriptionService.getOrganizationPlan(organizationId);

		const [monitors, statusPages] = await Promise.all([
			this.checkUsage(organizationId, "monitors"),
			this.checkUsage(organizationId, "statusPages"),
		]);

		return {
			monitors,
			statusPages,
			plan: {
				id: plan.id,
				name: plan.name,
			},
		};
	}

	/**
	 * Builds a user-friendly message about resource usage.
	 */
	private buildUsageMessage(
		resource: LimitedResourceType,
		currentUsage: number,
		limit: number,
		percentage: number,
	): string {
		const resourceName = resource === "monitors" ? "monitors" : "status pages";

		if (percentage >= USAGE_THRESHOLDS.LIMIT) {
			return `You've reached the limit of ${limit} ${resourceName} on your current plan. Upgrade to add more.`;
		}

		if (percentage >= USAGE_THRESHOLDS.WARNING) {
			return `You're using ${currentUsage} of ${limit} ${resourceName} (${Math.round(percentage)}%). Consider upgrading soon.`;
		}

		return `Using ${currentUsage} of ${limit} ${resourceName}.`;
	}
}

export const usageService = new UsageService();
