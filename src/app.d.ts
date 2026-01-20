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
}

// oxlint-disable-next-line require-module-specifiers
export {};
