/** `target` as a path on `origin`, or null when it resolves anywhere else. */
export function sameOriginPath(target: string | null, origin: string): string | null {
	if (!target) return null;
	try {
		const url = new URL(target, origin);
		return url.origin === origin ? url.pathname + url.search + url.hash : null;
	} catch {
		return null;
	}
}
