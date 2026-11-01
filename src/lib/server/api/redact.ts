import { parseWebUrl } from "../../utils/web-url";

/** A name short and plain enough to show. A longer or stranger key may be a token. */
const PARAM_NAME = /^[A-Za-z][\w.-]{0,23}$/;

/**
 * A monitor URL for readers who must not see its secrets. Removes `user:pass@` and the
 * fragment, and masks every query value, matrix parameter, and query name that has no
 * value or does not read as a name, so `?token=abc` reads `?token=***`. Plain names stay,
 * so monitors that differ only by query remain distinguishable.
 *
 * The host and path stay, because an alert without them does not say what broke. A
 * secret written there, like a webhook token in the path, is not removed. Nor is a
 * secret used as a plain query name that has a value, like `?hunter2=1`.
 *
 * Null unless the URL parses as http or https: a string with no scheme, like
 * `admin:pass@host`, parses with `admin:` as its scheme, and neither that nor an unparsed
 * string can be checked for secrets.
 */
export function redactUrl(raw: string | null): string | null {
	const url = raw === null ? null : parseWebUrl(raw);
	if (!url) return null;

	url.username = "";
	url.password = "";
	url.hash = "";
	url.pathname = url.pathname.replace(/;[^/]*/g, ";***");
	url.search = new URLSearchParams(
		[...url.searchParams.entries()].map(([key, value]) => {
			// `?abc==` parses as `abc` with the value `=`: a base64 token, not a name.
			const bare = /^=*$/.test(value);
			return [!bare && PARAM_NAME.test(key) ? key : "***", bare ? "" : "***"];
		}),
	).toString();
	return url.toString();
}
