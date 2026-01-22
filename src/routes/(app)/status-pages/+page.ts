import { getStatusPages } from "$lib/remote/status-pages.remote";

export async function load() {
	const statusPages = await getStatusPages();
	return { statusPages };
}
