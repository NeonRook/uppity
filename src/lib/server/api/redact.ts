/** Stands in for a monitor URL that `redactUrl` cannot make safe to show. */
export const UNREADABLE_URL = "(hidden: not a valid web address)";

/**
 * A monitor URL with its credentials removed: no `user:pass@`, no fragment, and every
 * query value replaced, so `?token=abc` reads `?token=***`. Names of parameters with a
 * value stay, so monitors that differ only by query remain distinguishable; a name with
 * no value may be a bare token and is masked too. Null unless the URL parses as http or
 * https: a string with no scheme, like `admin:pass@host`, parses with `admin:` as its
 * scheme, and neither that nor an unparsed string can be checked for secrets.
 */
export function redactUrl(raw: string | null): string | null {
	if (raw === null) return null;
	const url = URL.parse(raw);
	if (url?.protocol !== "http:" && url?.protocol !== "https:") return null;

	url.username = "";
	url.password = "";
	url.hash = "";
	url.search = new URLSearchParams(
		[...url.searchParams.entries()].map(([key, value]) =>
			value === "" ? ["***", ""] : [key, "***"],
		),
	).toString();
	return url.toString();
}
