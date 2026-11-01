/** The label under a custom domain that holds its ownership TXT record. */
export const DOMAIN_CHALLENGE_LABEL = "_uppity-challenge";

/** Names that only resolve inside a network, or are reserved and never delegated. */
const RESERVED_TLDS = new Set([
	"alt",
	"arpa",
	"corp",
	"example",
	"home",
	"internal",
	"intranet",
	"invalid",
	"lan",
	"local",
	"localhost",
	"onion",
	"private",
	"svc",
	"test",
]);

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * The canonical form of a public DNS name: lowercase, ASCII, no trailing dot. Null for anything
 * else, such as an address, an internal name or a URL, so no such value reaches a DNS lookup.
 */
export function normalizeDomain(input: string): string | null {
	const name = input.trim();
	if (/[^\p{L}\p{M}\p{N}.-]/u.test(name)) return null;

	const hostname = URL.parse(`https://${name}`)?.hostname ?? "";
	const domain = hostname.replace(/\.$/, "");
	const labels = domain.split(".");
	const tld = labels.at(-1) ?? "";

	const valid =
		domain.length <= 253 &&
		labels.length >= 2 &&
		labels.every((label) => LABEL.test(label)) &&
		TLD.test(tld) &&
		!RESERVED_TLDS.has(tld);
	return valid ? domain : null;
}

/** `normalizeDomain` for the value of a Host header, which may carry a port. */
export function domainOfHost(host: string): string | null {
	return normalizeDomain(host.replace(/:\d+$/, ""));
}

/** Public URL of a status page: its verified custom domain, otherwise the built-in path. */
export function getStatusPageUrl(page: { customDomain: string | null; slug: string }): string {
	return page.customDomain ? `https://${page.customDomain}` : `/status/${page.slug}`;
}
