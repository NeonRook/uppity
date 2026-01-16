import type { Handle } from "@sveltejs/kit";

import { building } from "$app/environment";
import { paraglideMiddleware } from "$lib/paraglide/server";
import { auth } from "$lib/server/auth";
import { scheduler } from "$lib/server/jobs/scheduler";
import { sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";

// Start the scheduler when the server starts (not during build)
if (!building) {
	void scheduler.start();
}

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(
		event.request,
		({ request, locale }: { request: Request; locale: string }) => {
			event.request = request;

			return resolve(event, {
				transformPageChunk: ({ html }) => html.replace("%paraglide.lang%", locale),
			});
		},
	);

const handleAuth: Handle = async ({ event, resolve }) => {
	// Populate session in locals for server-side access
	const session = await auth.api.getSession({
		headers: event.request.headers,
	});

	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Use svelteKitHandler for auth API routes
	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(handleParaglide, handleAuth);
