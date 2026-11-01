import type { Handle } from "@sveltejs/kit/hooks";

import { statusPageService } from "#lib/server/services/status-page.service.js";
import { normalizeDomain } from "#lib/status-page.js";

import { appUrl } from "./account-email";

const hostnameOf = (url: string) => URL.parse(url.trim())?.hostname.toLowerCase() ?? [];

/** Hosts that serve the application itself, as the operator configured them. */
const APP_HOSTS = new Set(
	[
		appUrl,
		process.env.ORIGIN ?? "",
		...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
	].flatMap(hostnameOf),
);

/** All a custom domain serves. Links in mail stay on the app host, so these need no routes here. */
const STATUS_ROUTES = new Set([
	"/(public)/status/[slug]",
	"/(public)/status/[slug]/incidents/[incidentId]",
]);

/** Platform health probes arrive under a hostname of the platform's choosing. */
const HEALTH_ROUTE = "/api/health";

const VARY_BY_HOST = { vary: "Host", "cache-control": "no-store" };

const refused = () => new Response("Not found", { status: 404, headers: VARY_BY_HOST });

/**
 * Decides what a request's host may reach. Addresses and internal names serve the app, because no
 * public DNS name can reach them and proxies and probes use them. A public name serves the app
 * only if it is configured as one of its hosts. Otherwise it must be a page's verified domain,
 * which serves that page and nothing else, with no session, or it gets a bare 404.
 */
export const handleStatusHost: Handle = async ({ event, resolve }) => {
	event.locals.statusHost = false;

	const domain = normalizeDomain(event.url.hostname);
	if (!domain || APP_HOSTS.has(domain)) return resolve(event);

	const slug = await statusPageService.findPublicSlugByDomain(domain);
	if (!slug) return event.route.id === HEALTH_ROUTE ? resolve(event) : refused();

	if (event.url.pathname === "/") {
		return new Response(null, {
			status: 307,
			headers: { ...VARY_BY_HOST, location: `/status/${slug}` },
		});
	}
	if (!STATUS_ROUTES.has(event.route.id ?? "") || event.params.slug !== slug) return refused();

	event.locals.statusHost = true;
	event.locals.user = null;
	event.locals.session = null;
	event.locals.apiCaller = null;

	const response = await resolve(event);
	response.headers.delete("set-cookie");
	response.headers.append("vary", "Host");
	return response;
};
