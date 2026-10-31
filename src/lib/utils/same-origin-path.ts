/** `target` as a path on `origin`, or null when it resolves anywhere else. */
export function sameOriginPath(target: string | null, origin: string): string | null {
	if (!target) return null;
	try {
		const url = new URL(target, origin);
		// "/.//evil.com" resolves here, but its path alone is protocol-relative.
		if (url.origin !== origin || url.pathname.startsWith("//")) return null;
		return url.pathname + url.search + url.hash;
	} catch {
		return null;
	}
}
