import { envInt } from "$lib/utils";

/** How long a user session remains valid before requiring re-authentication. */
export const SESSION_EXPIRES_IN_SECONDS = envInt(
	"UPPITY_SESSION_EXPIRES_IN_SECONDS",
	60 * 60 * 24 * 30,
);

/** Minimum time between session token refreshes to reduce database writes. */
export const SESSION_UPDATE_AGE_SECONDS = envInt("UPPITY_SESSION_UPDATE_AGE_SECONDS", 60 * 60 * 24);

/** Maximum number of users that can be members of a single organization. */
export const ORGANIZATION_MEMBERSHIP_LIMIT = envInt("UPPITY_ORGANIZATION_MEMBERSHIP_LIMIT", 100);

/** Maximum number of organizations a single user can create. */
export const ORGANIZATION_LIMIT_PER_USER = envInt("UPPITY_ORGANIZATION_LIMIT_PER_USER", 5);

/** Role automatically assigned to the user who creates an organization. */
export const ORGANIZATION_CREATOR_ROLE = "owner" as const;
