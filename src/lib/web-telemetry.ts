import { init } from "@dash0/sdk-web";

import type { Deployment } from "#lib/server/deployment.js";

export interface WebTelemetryConfig {
	url: string;
	authToken: string;
	deployment: Deployment;
}

const SERVICE_NAMESPACE = "uppity";
const REPOSITORY = {
	providerName: "github",
	ownerName: "NeonRook",
	repositoryName: "uppity",
	repositoryUrlFull: "https://github.com/NeonRook/uppity",
};

/** Browser monitoring for the signed-in app. Query strings stay in the browser. */
export function startWebTelemetry({ url, authToken, deployment }: WebTelemetryConfig): void {
	init({
		serviceName: "uppity-web",
		serviceNamespace: SERVICE_NAMESPACE,
		serviceVersion: deployment.version,
		environment: deployment.environment,
		deploymentName: deployment.name,
		deploymentId: deployment.id,
		vcs: { ...REPOSITORY, refHeadName: deployment.name, refHeadRevision: deployment.revision },
		endpoint: { url, authToken },
		urlAttributeScrubber: ({ "url.query": _query, ...attributes }) => attributes,
	});
}
