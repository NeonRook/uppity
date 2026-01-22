import { getMonitors } from "$lib/remote/monitors.remote";

export async function load() {
	// Await the query to block navigation until data is ready
	const monitors = await getMonitors();
	return { monitors };
}
