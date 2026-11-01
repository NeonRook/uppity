import { building } from "$app/env";
import { sequence, type Handle } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";

import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { handleAdminGate } from "#lib/server/admin-gate.js";
import { apiAuthDeps } from "#lib/server/api-auth.instance.js";
import { authenticateApiRequest, requiresApiKey } from "#lib/server/api-auth.js";
import { auth } from "#lib/server/auth.js";
import { clientAddress } from "#lib/server/client-ip.js";
import { wideEvent, type RequestWideEvent } from "#lib/server/logger/index.js";
import { handleStatusHost } from "#lib/server/status-host.js";

/**
 * Logging middleware - creates wide event and emits on request completion.
 * Must be first in the sequence to capture full request lifecycle.
 */
const handleLogging: Handle = async ({ event, resolve }) => {
	const reqEvent = wideEvent<RequestWideEvent>("http", "http_request", "req");

	// Set initial HTTP context
	reqEvent.merge({
		http_method: event.request.method,
		http_path: event.url.pathname,
		http_route: event.route.id ?? undefined,
		user_agent: event.request.headers.get("user-agent") ?? undefined,
		client_ip: clientAddress(event) ?? undefined,
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
		if (event.locals.apiCaller) {
			reqEvent.merge({
				org_id: event.locals.apiCaller.organizationId,
				api_key_id: event.locals.apiCaller.keyId,
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
	paraglideMiddleware(event.request, ({ locale }: { locale: string }) =>
		resolve(event, {
			transformPageChunk: ({ html }) => html.replace("%paraglide.lang%", locale),
		}),
	);

/** Resolves the API key on keyed `/api/v1` requests and refuses the request when it fails. */
const handleApi: Handle = async ({ event, resolve }) => {
	event.locals.apiCaller = null;
	if (!requiresApiKey(event.route.id)) return resolve(event);

	const caller = await authenticateApiRequest(event.request, apiAuthDeps);
	if (caller instanceof Response) return caller;
	event.locals.apiCaller = caller;
	return resolve(event);
};

const handleAuth: Handle = async ({ event, resolve }) => {
	if (event.locals.statusHost) return resolve(event);

	const session = await auth.api.getSession({
		headers: event.request.headers,
	});

	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// svelteKitHandler automatically handles better-auth routes
	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = sequence(
	handleLogging,
	handleStatusHost,
	handleParaglide,
	handleApi,
	handleAuth,
	handleAdminGate,
);
