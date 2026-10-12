/** Thrown when an organization's plan limit blocks the action. */
export class SubscriptionLimitError extends Error {
	override name = "SubscriptionLimitError";
}

/** Thrown when the organization's plan does not include the requested feature. */
export class FeatureNotAvailableError extends Error {
	override name = "FeatureNotAvailableError";
}

/** Thrown when an email channel address would exceed the pending-confirmation cap. */
export class ConfirmationCapError extends Error {
	override name = "ConfirmationCapError";
}

/** Thrown when an unverified member tries to send mail to someone else's address. */
export class EmailVerificationRequiredError extends Error {
	override name = "EmailVerificationRequiredError";
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
