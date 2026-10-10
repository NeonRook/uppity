import type { RequestEvent } from "@sveltejs/kit";

/**
 * The header a reverse proxy overwrites with the client address, such as
 * `x-real-ip` on Railway. Behind a proxy the socket peer is the proxy itself.
 *
 * Only set this when every request passes through a proxy that replaces the
 * header. Otherwise clients supply it and choose their own address.
 */
export const clientIpHeader = process.env.CLIENT_IP_HEADER?.trim().toLowerCase() || undefined;

/** Null when the address cannot be determined. */
export function clientAddress(event: RequestEvent): string | null {
	if (clientIpHeader) return event.request.headers.get(clientIpHeader);
	try {
		return event.getClientAddress();
	} catch {
		return null;
	}
}
