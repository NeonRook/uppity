export const SERVICE_NAMESPACE = "uppity";

export const REPOSITORY = {
	provider: "github",
	owner: "NeonRook",
	name: "uppity",
	url: "https://github.com/NeonRook/uppity",
} as const;

/**
 * The running build, for server and browser telemetry alike. Railway sets the `RAILWAY_*`
 * variables, its Git ones on GitHub-triggered deploys only, so all of them may be absent.
 */
export function deployment() {
	return {
		environment: process.env.UPPITY_ENVIRONMENT || "production",
		version: import.meta.env.APP_VERSION,
		name: process.env.RAILWAY_GIT_BRANCH,
		id: process.env.RAILWAY_DEPLOYMENT_ID,
		revision: process.env.RAILWAY_GIT_COMMIT_SHA,
	};
}

export type Deployment = ReturnType<typeof deployment>;
