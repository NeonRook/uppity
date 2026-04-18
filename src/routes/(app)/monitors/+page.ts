import { getMonitors } from "$lib/remote/monitors.remote";

export async function load() {
	const monitors = await getMonitors().run();
	return { monitors };
}
