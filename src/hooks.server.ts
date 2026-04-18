import { building } from "$app/environment";
import { paraglideMiddleware } from "$lib/paraglide/server";
import { auth } from "$lib/server/auth";
import { createRequestWideEvent } from "$lib/server/logger";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";

/**
 * Logging middleware - creates wide event and emits on request completion.
 * Must be first in the sequence to capture full request lifecycle.
 */
const handleLogging: Handle = async ({ event, resolve }) => {
	const reqEvent = createRequestWideEvent();
	let client_ip: string | undefined;
	try {
		client_ip = event.getClientAddress();
	} catch (error) {
		// best effort, this may fail with no recovery method
		console.debug("Failed to determine client IP address, ignoring", error);
	}

	// Set initial HTTP context
	reqEvent.merge({
		http_method: event.request.method,
		http_path: event.url.pathname,
		http_route: event.route.id ?? undefined,
		user_agent: event.request.headers.get("user-agent") ?? undefined,
		client_ip,
	});

	// Store in locals for enrichment by other handlers/services
	event.locals.event = reqEvent;

	try {
		const response = await resolve(event);

		// Set response status and mark success
		reqEvent.set("http_status", response.status);
		if (response.status >= 400) {
			reqEvent.setStatus("error");
		} else {
			reqEvent.setSuccess();
		}

		return response;
	} catch (error) {
		reqEvent.setError(error);
		throw error;
	} finally {
		// Enrich with auth context if available (set by handleAuth)
		if (event.locals.user) {
			reqEvent.merge({
				user_id: event.locals.user.id,
				user_email: event.locals.user.email,
			});
		}
		if (event.locals.session) {
			reqEvent.merge({
				session_id: event.locals.session.id,
				org_id: event.locals.session.activeOrganizationId ?? undefined,
			});
		}

		// Emit the wide event
		reqEvent.emit("request");
	}
};

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
	const session = await auth.api.getSession({
		headers: event.request.headers,
	});

	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// svelteKitHandler automatically handles better-auth routes
	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(handleLogging, handleParaglide, handleAuth);
