/**
 * Error thrown when a subscription limit is exceeded.
 */
export class SubscriptionLimitError extends Error {
	readonly code = "SUBSCRIPTION_LIMIT_EXCEEDED";
	readonly limit: number;
	readonly currentUsage: number;

	constructor(message: string, options?: { limit?: number; currentUsage?: number }) {
		super(message);
		this.name = "SubscriptionLimitError";
		this.limit = options?.limit ?? 0;
		this.currentUsage = options?.currentUsage ?? 0;
	}
}

/**
 * Error thrown when a feature is not available on the current plan.
 */
export class FeatureNotAvailableError extends Error {
	readonly code = "FEATURE_NOT_AVAILABLE";
	readonly feature: string;

	constructor(message: string, feature: string) {
		super(message);
		this.name = "FeatureNotAvailableError";
		this.feature = feature;
	}
}
