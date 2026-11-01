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
	const uppityEnvironment = prod ? "production" : "staging";
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

	// Alerts and subscriber mail go to addresses customers and visitors type in,
	// so they send through Resend. Their bounces cannot get the Scaleway account
	// that sends sign-in mail suspended.
	const resend = {
		host: "smtp.resend.com",
		password: ctx.shared.RESEND_API_KEY,
		port: "465",
		user: "resend",
	};
	const subscriberFrom = "Uppity Status <updates@status.uppity.cloud>";

	const Postgres = postgres("Postgres", { region: "europe-west4-drams3a" });
	const drizzleGatewayVolume = volume("drizzle-gateway-volume", volumeOptions);
	const postgresVolume = volume("pg-volume-prod", volumeOptions);
	// Every service runs the same image, so each needs its start command spelled
	// out. A service without one inherits the Dockerfile's CMD and comes up as a
	// second web server instead of the process it is named for.
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
			OTEL_EXPORTER_OTLP_ENDPOINT: preserve(),
			OTEL_EXPORTER_OTLP_HEADERS: preserve(),
			POLAR_ACCESS_TOKEN: ctx.shared.POLAR_ACCESS_TOKEN,
			POLAR_PRODUCT_DEDICATED_ANNUAL: staging("05d4b061-6593-4844-857a-c88c2a3764bb"),
			POLAR_PRODUCT_DEDICATED_MONTHLY: staging("7ed4e4b8-4e6c-4000-9c95-71d48ece4cf0"),
			POLAR_PRODUCT_FREE: staging("9114a17a-f0db-49cf-a188-53807a67e6c9"),
			POLAR_PRODUCT_UPPITY_ANNUAL: staging("e419d94d-6200-4dec-a006-135475edd0ac"),
			POLAR_PRODUCT_UPPITY_MONTHLY: staging("b0da7b4f-7c13-43f5-8325-f08f125d3d9c"),
			POLAR_SERVER: ctx.shared.POLAR_SERVER,
			POLAR_WEBHOOK_SECRET: preserve(),
			RESEND_WEBHOOK_SECRET: preserve(),
			SMTP_FROM: "Uppity <noreply@uppity.cloud>",
			SMTP_HOST: ctx.shared.SMTP_HOST,
			SMTP_PASSWORD: preserve(),
			SMTP_PORT: ctx.shared.SMTP_PORT,
			SMTP_USER: preserve(),
			SUBSCRIBER_SMTP_FROM: subscriberFrom,
			SUBSCRIBER_SMTP_HOST: resend.host,
			SUBSCRIBER_SMTP_PASSWORD: resend.password,
			SUBSCRIBER_SMTP_PORT: resend.port,
			SUBSCRIBER_SMTP_USER: resend.user,
			TURNSTILE_SECRET_KEY: preserve(),
			TURNSTILE_SITE_KEY: preserve(),
			UPPITY_ENVIRONMENT: uppityEnvironment,
			UPPITY_GATE_SUBSCRIBER_EMAIL: "true",
			UPPITY_LANDING_STATUS_SLUG: preserve(),
			UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL: preserve(),
			UPPITY_OPS_ALERT_EMAIL: preserve(),
			UPPITY_WEB_OTLP_ENDPOINT: preserve(),
			UPPITY_WEB_OTLP_TOKEN: preserve(),
		},
	});
	const workerNotifier = service("worker-notifier", {
		source: uppity,
		build,
		replicas: { "europe-west4-drams3a": 1 },
		// A stopped worker fails silently; a crash-looping one shows in the logs.
		deploy: { restartPolicyType: "ALWAYS", startCommand: "./entrypoint.sh worker-notifier" },
		env: {
			BETTER_AUTH_SECRET: ctx.shared.BETTER_AUTH_SECRET,
			// Alert and subscriber mail link back to the server.
			BETTER_AUTH_URL: uppityServer.env.BETTER_AUTH_URL,
			DATABASE_URL: Postgres.env.DATABASE_URL,
			NODE_ENV: ctx.shared.NODE_ENV,
			OTEL_EXPORTER_OTLP_ENDPOINT: preserve(),
			OTEL_EXPORTER_OTLP_HEADERS: preserve(),
			SERVICE_NAME: staging("worker-notifier"),
			SMTP_FROM: "Uppity Alerts <alerts@alerts.uppity.cloud>",
			SMTP_HOST: resend.host,
			SMTP_PASSWORD: resend.password,
			SMTP_PORT: resend.port,
			SMTP_USER: resend.user,
			SUBSCRIBER_SMTP_FROM: subscriberFrom,
			// The server hides the form and the notifier drops the mail on this one setting.
			UPPITY_ENVIRONMENT: uppityEnvironment,
			UPPITY_GATE_SUBSCRIBER_EMAIL: uppityServer.env.UPPITY_GATE_SUBSCRIBER_EMAIL,
			UPPITY_OPS_ALERT_DISCORD_WEBHOOK_URL: preserve(),
			UPPITY_OPS_ALERT_EMAIL: preserve(),
		},
	});
	const workerMonitor = service("worker-monitor", {
		source: uppity,
		build,
		replicas: { "europe-west4-drams3a": 1 },
		// A stopped worker fails silently; a crash-looping one shows in the logs.
		deploy: { restartPolicyType: "ALWAYS", startCommand: "./entrypoint.sh worker-monitor" },
		networking: { privateNetworkEndpoint: "uppity-worker" },
		env: {
			BETTER_AUTH_SECRET: ctx.shared.BETTER_AUTH_SECRET,
			DATABASE_URL: Postgres.env.DATABASE_URL,
			NODE_ENV: ctx.shared.NODE_ENV,
			OTEL_EXPORTER_OTLP_ENDPOINT: preserve(),
			OTEL_EXPORTER_OTLP_HEADERS: preserve(),
			POLAR_ACCESS_TOKEN: ctx.shared.POLAR_ACCESS_TOKEN,
			POLAR_SERVER: ctx.shared.POLAR_SERVER,
			SERVICE_NAME: staging("worker-monitor"),
			UPPITY_ENVIRONMENT: uppityEnvironment,
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
