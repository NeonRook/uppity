/** Public URL of a status page: its custom domain when set, otherwise the built-in path. */
export function getStatusPageUrl(page: { customDomain: string | null; slug: string }): string {
	return page.customDomain ? `https://${page.customDomain}` : `/status/${page.slug}`;
}
