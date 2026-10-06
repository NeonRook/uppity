/** Thrown when an organization's plan limit blocks the action. */
export class SubscriptionLimitError extends Error {
	override name = "SubscriptionLimitError";
}

/** Thrown when the organization's plan does not include the requested feature. */
export class FeatureNotAvailableError extends Error {
	override name = "FeatureNotAvailableError";
}

/**
 * Error thrown when a referenced row does not exist in the caller's organization.
 */
export class NotFoundError extends Error {
	readonly code = "NOT_FOUND";

	constructor(message: string) {
		super(message);
		this.name = "NotFoundError";
	}
}
