import { getStatusPages } from "#lib/remote/status-pages.remote.js";

export async function load() {
	const statusPages = await getStatusPages();
	return { statusPages };
}
