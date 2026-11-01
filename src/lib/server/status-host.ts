import type { Handle } from "@sveltejs/kit/hooks";

import { statusPageService } from "#lib/server/services/status-page.service.js";
import { domainOfHost, REWRITTEN_ORIGIN_HEADER } from "#lib/status-page.js";

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

const PAGE_ROUTE = "/(public)/status/[slug]";

/** All a custom domain serves. Links in mail stay on the app host, so these need no routes here. */
const CUSTOM_DOMAIN_ROUTES = new Set([PAGE_ROUTE, `${PAGE_ROUTE}/incidents/[incidentId]`]);

/** Platform probes need no lookup, so one answers while the database is down. */
const HEALTH_ROUTE = "/api/health";

const VARY_BY_HOST = { vary: "Host", "cache-control": "no-store" };

const refused = () => new Response("Not found", { status: 404, headers: VARY_BY_HOST });
const crossSite = () => new Response("Cross-site form submissions are forbidden", { status: 403 });

/**
 * Decides what a request's host may reach. A verified domain serves its page and nothing else,
 * with no session. Every other host serves the app, because a host the operator never configured
 * must not take an install offline, and the session cookie never reaches a host it was not set
 * on. The exception is a page on a verified domain: it serves there or on an app host, so a
 * lookalike domain pointed at this instance cannot show it.
 */
export const handleStatusHost: Handle = async ({ event, resolve }) => {
	event.locals.statusHost = false;
	if (event.route.id === HEALTH_ROUTE) return resolve(event);

	// With ORIGIN set, `event.url` holds the pinned origin rather than the host requested.
	const host = process.env.ORIGIN ? (event.request.headers.get("host") ?? "") : event.url.host;
	const domain = domainOfHost(host);
	const external = domain !== null && !APP_HOSTS.has(domain);

	const page = external ? await statusPageService.findByDomain(domain) : null;
	if (!page) {
		if (event.request.headers.has(REWRITTEN_ORIGIN_HEADER)) return crossSite();

		const { slug } = event.params;
		const onPageRoute = slug !== undefined && event.route.id?.startsWith(PAGE_ROUTE);
		if (external && onPageRoute && (await statusPageService.hasCustomDomain(slug))) {
			return refused();
		}
		return resolve(event);
	}

	if (!page.isPublic || event.isRemoteRequest) return refused();
	if (event.url.pathname === "/") {
		return new Response(null, {
			status: 307,
			headers: { ...VARY_BY_HOST, location: `/status/${page.slug}` },
		});
	}
	if (!CUSTOM_DOMAIN_ROUTES.has(event.route.id ?? "") || event.params.slug !== page.slug) {
		return refused();
	}

	event.locals.statusHost = true;
	event.locals.user = null;
	event.locals.session = null;
	event.locals.apiCaller = null;

	const response = await resolve(event);
	response.headers.delete("set-cookie");
	response.headers.append("vary", "Host");
	return response;
};
