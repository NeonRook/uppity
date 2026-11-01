import type { IncomingMessage } from "node:http";

import { domainOfHost } from "../src/lib/status-page.ts";

/**
 * Header names this server sets on every request and hands to adapter-node as
 * PROTOCOL_HEADER and HOST_HEADER. Whatever a client sends under them is
 * overwritten, so it cannot choose the origin.
 */
export const PROTOCOL_HEADER = "x-uppity-origin-protocol";
export const HOST_HEADER = "x-uppity-origin-host";

/** ORIGIN as a URL, or undefined when unset. Throws unless it is a bare http(s) origin. */
export function parseOrigin(input: string | undefined): URL | undefined {
	if (!input) return undefined;

	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`ORIGIN must be a URL such as https://status.example.com, received: ${input}`);
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`ORIGIN must use http or https, received: ${input}`);
	}
	if (url.origin !== input.replace(/\/$/, "")) {
		throw new Error(
			`ORIGIN must be a scheme and host only, such as ${url.origin}, received: ${input}`,
		);
	}

	return url;
}

/**
 * When ORIGIN is set, points adapter-node at the headers above and returns what
 * sets them on each request. Unset, it changes nothing and the adapter's own
 * header settings apply. The adapter reads those settings once, when its
 * handler module loads, so this must run before that import.
 *
 * A Host that is a public DNS name keeps its own origin, because a status page's
 * custom domain must pass the same-origin check on form posts. The web tier's
 * first hook refuses every such name that is not an app host or verified domain.
 * Addresses and internal names, which no browser can be sent to by a public
 * name, stay pinned.
 */
export function pinOrigin(env: NodeJS.ProcessEnv): ((req: IncomingMessage) => void) | undefined {
	const origin = parseOrigin(env.ORIGIN);
	if (!origin) return undefined;

	env.PROTOCOL_HEADER = PROTOCOL_HEADER;
	env.HOST_HEADER = HOST_HEADER;
	// The host carries the port already; a port header would append a second.
	delete env.PORT_HEADER;

	const protocol = origin.protocol.slice(0, -1);
	return (req) => {
		req.headers[PROTOCOL_HEADER] = protocol;
		req.headers[HOST_HEADER] = domainOfHost(req.headers.host ?? "")
			? req.headers.host
			: origin.host;
	};
}
