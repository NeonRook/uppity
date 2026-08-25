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
	// Every service runs the same image, so each needs its start command spelled
	// out. A service without one inherits the Dockerfile's CMD and comes up as a
	// second web server instead of the process it is named for.
	const workerNotifier = service("worker-notifier", {
		source: uppity,
		build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "/Dockerfile" },
		replicas: { "europe-west4-drams3a": 1 },
		deploy: { restartPolicyMaxRetries: 3, startCommand: "./entrypoint.sh worker-notifier" },
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
		deploy: { restartPolicyMaxRetries: 3, startCommand: "./entrypoint.sh worker-monitor" },
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
		// Railway does not read the Dockerfile's HEALTHCHECK, so without this a
		// deploy counts as healthy the moment the process starts and takes traffic
		// before it can serve.
		healthcheck: "/api/health",
		// Migrations run between build and deploy, so a failure aborts the deploy and
		// leaves the running version serving. Only this service runs them, for the
		// reason scripts/migrate.ts records. The workers deploy alongside and run
		// against the old schema until this finishes.
		deploy: {
			startCommand: "./entrypoint.sh serve",
			preDeployCommand: ["./entrypoint.sh migrate"],
		},
		domains: ["uppity.cloud"],
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
