import {
	defineRailway,
	github,
	group,
	image,
	postgres,
	preserve,
	project,
	service,
	volume,
} from "railway/iac";

export default defineRailway(() => {
	const uppity = github("NeonRook/uppity", { checkSuites: false });

	const Postgres18 = postgres("Postgres-18", { region: "europe-west4-drams3a" });
	const drizzleGatewayVolume = volume("drizzle-gateway-volume", {
		alerts: { usage: { "100": {}, "80": {}, "95": {} } },
		allowOnlineResize: true,
		region: "europe-west4-drams3a",
		sizeMB: 5000,
	});
	const postgres18Volume = volume("postgres18-volume", {
		alerts: { usage: { "100": {}, "80": {}, "95": {} } },
		allowOnlineResize: true,
		region: "europe-west4-drams3a",
		sizeMB: 5000,
	});
	const workerNotifier = service("worker-notifier", {
		source: uppity,
		build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "/Dockerfile" },
		replicas: { "europe-west4-drams3a": 1 },
		deploy: { restartPolicyMaxRetries: 3 },
		env: {
			BETTER_AUTH_SECRET: preserve(),
			DATABASE_URL: preserve(),
			NODE_ENV: preserve(),
			SERVICE_NAME: preserve(),
		},
	});
	const workerMonitor = service("worker-monitor", {
		source: uppity,
		build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "/Dockerfile" },
		replicas: { "europe-west4-drams3a": 1 },
		deploy: { restartPolicyMaxRetries: 3 },
		networking: { privateNetworkEndpoint: "uppity-worker" },
		env: {
			BETTER_AUTH_SECRET: preserve(),
			DATABASE_URL: preserve(),
			NODE_ENV: preserve(),
			POLAR_ACCESS_TOKEN: preserve(),
			POLAR_SERVER: preserve(),
			SERVICE_NAME: preserve(),
		},
	});
	const DrizzleGateway = service("Drizzle Gateway", {
		source: image("ghcr.io/drizzle-team/gateway:latest"),
		healthcheck: "/health",
		replicas: { "europe-west4-drams3a": 1 },
		networking: { privateNetworkEndpoint: "drizzle-gateway" },
		volumeMounts: {
			"/app": drizzleGatewayVolume,
		},
		env: {
			DATABASE_URL: preserve(),
			MASTERPASS: preserve(),
		},
	});
	const uppityServer = service("uppity-server", {
		source: uppity,
		build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "/Dockerfile" },
		replicas: { "europe-west4-drams3a": 1 },
		domains: ["uppity.cloud"],
		networking: { privateNetworkEndpoint: "uppity-server" },
		env: {
			BETTER_AUTH_SECRET: preserve(),
			BETTER_AUTH_TRUSTED_ORIGINS: preserve(),
			BETTER_AUTH_URL: preserve(),
			DATABASE_URL: preserve(),
			NODE_ENV: preserve(),
			POLAR_ACCESS_TOKEN: preserve(),
			POLAR_PRODUCT_DEDICATED_ANNUAL: preserve(),
			POLAR_PRODUCT_DEDICATED_MONTHLY: preserve(),
			POLAR_PRODUCT_FREE: preserve(),
			POLAR_PRODUCT_UPPITY_ANNUAL: preserve(),
			POLAR_PRODUCT_UPPITY_MONTHLY: preserve(),
			POLAR_SERVER: preserve(),
			POLAR_WEBHOOK_SECRET: preserve(),
			UPPITY_LANDING_STATUS_SLUG: preserve(),
			VITE_BETTER_AUTH_URL: preserve(),
		},
	});
	const Application = group("Application", [workerNotifier, workerMonitor, uppityServer]);
	const Persistance = group("Persistance", [Postgres18, DrizzleGateway]);

	return project("uppity", {
		resources: [drizzleGatewayVolume, postgres18Volume, Application, Persistance],
	});
});
