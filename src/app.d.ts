// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user: import("$lib/server/auth").User | null;
			session: import("$lib/server/auth").Session["session"] | null;
			event: import("$lib/server/logger").WideEventBuilder<
				import("$lib/server/logger").RequestWideEvent
			>;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	namespace NodeJS {
		interface ProcessEnv {
			// Database
			DATABASE_URL: string;

			// Authentication
			BETTER_AUTH_SECRET: string;
			BETTER_AUTH_URL: string;
			BETTER_AUTH_TRUSTED_ORIGINS: string;
			VITE_BETTER_AUTH_URL: string;

			// Server [Optional]
			PORT?: string;
			HOST?: string;

			// Email Notifications [Optional]
			SMTP_HOST?: string;
			SMTP_PORT?: string;
			SMTP_USER?: string;
			SMTP_PASSWORD?: string;
			SMTP_FROM?: string;
			UPPITY_EMAIL_FROM?: string;

			// Monitor Defaults [Optional]
			UPPITY_DEFAULT_TIMEOUT_SECONDS?: string;
			UPPITY_DEFAULT_INTERVAL_SECONDS?: string;
			UPPITY_DEFAULT_RETRIES?: string;
			UPPITY_DEFAULT_ALERT_AFTER_FAILURES?: string;
			UPPITY_DEFAULT_PUSH_GRACE_PERIOD_SECONDS?: string;
			UPPITY_DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS?: string;
			UPPITY_DEGRADED_RESPONSE_TIME_MS?: string;
			UPPITY_SSL_INFO_TIMEOUT_MS?: string;
			UPPITY_RETRY_DELAY_MS?: string;

			// Status Page [Optional]
			UPPITY_STATUS_PAGE_HISTORY_DAYS?: string;

			// Worker Scheduler [Optional]
			UPPITY_MIN_INTERVAL_SECONDS?: string;
			UPPITY_MAX_INTERVAL_SECONDS?: string;
			UPPITY_WORKER_BATCH_SIZE?: string;
			UPPITY_WORKER_POLL_INTERVAL_MS?: string;
			UPPITY_WORKER_BACKOFF_INITIAL_MS?: string;
			UPPITY_WORKER_BACKOFF_MAX_MS?: string;
			UPPITY_CHECK_MAX_RETRIES?: string;
			UPPITY_CHECK_BACKOFF_INITIAL_MS?: string;
			UPPITY_CHECK_BACKOFF_MAX_MS?: string;
			UPPITY_DEAD_LETTER_HOURS?: string;

			// Session & Organization [Optional]
			UPPITY_SESSION_EXPIRES_IN_SECONDS?: string;
			UPPITY_SESSION_UPDATE_AGE_SECONDS?: string;
			UPPITY_ORGANIZATION_MEMBERSHIP_LIMIT?: string;
			UPPITY_ORGANIZATION_LIMIT_PER_USER?: string;

			// Admin [Optional]
			UPPITY_DEFAULT_LIST_LIMIT?: string;
		}
	}
}

// oxlint-disable-next-line require-module-specifiers
export {};
