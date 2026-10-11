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

export default defineRailway((ctx) => {
	const prod = ctx.isEnvironment("production");
	// Production's values live in Railway; staging's are declared here and point
	// at Polar Sandbox.
	const staging = (value: string) => (prod ? preserve() : value);
	const uppity = github("NeonRook/uppity", { checkSuites: false });

	const build = {
		buildEnvironment: "V3",
		builder: "DOCKERFILE",
		dockerfilePath: "/Dockerfile",
	} as const;
	const volumeOptions = {
		alerts: { usage: { "100": {}, "80": {}, "95": {} } },
		allowOnlineResize: true,
		region: "europe-west4-drams3a",
		sizeMB: 5000,
	} as const;

	const Postgres = postgres("Postgres", { region: "europe-west4-drams3a" });
	const drizzleGatewayVolume = volume("drizzle-gateway-volume", volumeOptions);
	const postgresVolume = volume("pg-volume-prod", volumeOptions);
	// Every service runs the same image, so each needs its start command spelled
	// out. A service without one inherits the Dockerfile's CMD and comes up as a
	// second web server instead of the process it is named for.
	const workerNotifier = service("worker-notifier", {
		source: uppity,
		build,
		replicas: { "europe-west4-drams3a": 1 },
		deploy: { restartPolicyMaxRetries: 3, startCommand: "./entrypoint.sh worker-notifier" },
		env: {
			BETTER_AUTH_SECRET: ctx.shared.BETTER_AUTH_SECRET,
			DATABASE_URL: Postgres.env.DATABASE_URL,
			NODE_ENV: ctx.shared.NODE_ENV,
			SERVICE_NAME: staging("worker-notifier"),
			// Alerts send from their own domain. Recipients are typed in by customers,
			// so their bounces cannot get the auth domain blocked.
			SMTP_FROM: "Uppity Alerts <alerts@alerts.uppity.cloud>",
			SMTP_HOST: ctx.shared.SMTP_HOST,
			SMTP_PASSWORD: preserve(),
			SMTP_PORT: ctx.shared.SMTP_PORT,
			SMTP_USER: preserve(),
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
			DATABASE_URL: Postgres.env.DATABASE_URL,
			MASTERPASS: preserve(),
		},
	});
	const uppityServer = service("uppity-server", {
		source: uppity,
		build,
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
		domains: [prod ? "uppity.cloud" : "staging.uppity.cloud"],
		env: {
			// Production's server keeps its own secret rather than the shared one.
			BETTER_AUTH_SECRET: prod ? preserve() : ctx.shared.BETTER_AUTH_SECRET,
			BETTER_AUTH_TRUSTED_ORIGINS: staging("https://staging.uppity.cloud"),
			BETTER_AUTH_URL: staging("https://staging.uppity.cloud"),
			// Railway's edge overwrites this header; X-Forwarded-For arrives as a chain.
			CLIENT_IP_HEADER: "x-real-ip",
			DATABASE_URL: Postgres.env.DATABASE_URL,
			NODE_ENV: ctx.shared.NODE_ENV,
			POLAR_ACCESS_TOKEN: ctx.shared.POLAR_ACCESS_TOKEN,
			POLAR_PRODUCT_DEDICATED_ANNUAL: staging("05d4b061-6593-4844-857a-c88c2a3764bb"),
			POLAR_PRODUCT_DEDICATED_MONTHLY: staging("7ed4e4b8-4e6c-4000-9c95-71d48ece4cf0"),
			POLAR_PRODUCT_FREE: staging("9114a17a-f0db-49cf-a188-53807a67e6c9"),
			POLAR_PRODUCT_UPPITY_ANNUAL: staging("e419d94d-6200-4dec-a006-135475edd0ac"),
			POLAR_PRODUCT_UPPITY_MONTHLY: staging("b0da7b4f-7c13-43f5-8325-f08f125d3d9c"),
			POLAR_SERVER: ctx.shared.POLAR_SERVER,
			POLAR_WEBHOOK_SECRET: preserve(),
			SMTP_FROM: "Uppity <noreply@uppity.cloud>",
			SMTP_HOST: ctx.shared.SMTP_HOST,
			SMTP_PASSWORD: preserve(),
			SMTP_PORT: ctx.shared.SMTP_PORT,
			SMTP_USER: preserve(),
			UPPITY_LANDING_STATUS_SLUG: preserve(),
		},
	});
	const workerMonitor = service("worker-monitor", {
		source: uppity,
		build,
		replicas: { "europe-west4-drams3a": 1 },
		deploy: { restartPolicyMaxRetries: 3, startCommand: "./entrypoint.sh worker-monitor" },
		networking: { privateNetworkEndpoint: "uppity-worker" },
		env: {
			BETTER_AUTH_SECRET: ctx.shared.BETTER_AUTH_SECRET,
			DATABASE_URL: Postgres.env.DATABASE_URL,
			NODE_ENV: ctx.shared.NODE_ENV,
			POLAR_ACCESS_TOKEN: ctx.shared.POLAR_ACCESS_TOKEN,
			POLAR_SERVER: ctx.shared.POLAR_SERVER,
			SERVICE_NAME: staging("worker-monitor"),
			// Over-capacity notices are account email, so they send as the server does
			// and link back to it.
			BETTER_AUTH_URL: uppityServer.env.BETTER_AUTH_URL,
			SMTP_FROM: "Uppity <noreply@uppity.cloud>",
			SMTP_HOST: ctx.shared.SMTP_HOST,
			SMTP_PASSWORD: uppityServer.env.SMTP_PASSWORD,
			SMTP_PORT: ctx.shared.SMTP_PORT,
			SMTP_USER: uppityServer.env.SMTP_USER,
		},
	});
	const Application = group("Application", [workerNotifier, workerMonitor, uppityServer]);
	// Drizzle Gateway is a database GUI, so it only ever sees staging data.
	if (prod) {
		const Persistance = group("Persistance", [Postgres]);
		return project("uppity", { resources: [postgresVolume, Application, Persistance] });
	}
	const Persistance = group("Persistance", [Postgres, DrizzleGateway]);

	return project("uppity", { resources: [drizzleGatewayVolume, Application, Persistance] });
});
