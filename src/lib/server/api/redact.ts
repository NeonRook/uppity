/**
 * A monitor URL with its credentials removed: no `user:pass@`, no fragment, and every
 * query value replaced, so `?token=abc` reads `?token=***`. Parameter names stay, so
 * monitors that differ only by query remain distinguishable. Null when the URL does
 * not parse, since an unparsed string cannot be checked for secrets.
 */
export function redactUrl(raw: string | null): string | null {
	if (raw === null) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}

	url.username = "";
	url.password = "";
	url.hash = "";
	url.search = new URLSearchParams(
		[...url.searchParams.entries()].map(([key, value]) => [key, value === "" ? "" : "***"]),
	).toString();
	return url.toString();
}
