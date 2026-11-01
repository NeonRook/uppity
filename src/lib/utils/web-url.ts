/** `raw` parsed against `base`, or null unless the result is an http or https URL. */
export function parseWebUrl(raw: string, base?: URL): URL | null {
	const url = URL.parse(raw, base);
	return url?.protocol === "http:" || url?.protocol === "https:" ? url : null;
}
