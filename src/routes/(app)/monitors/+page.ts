import { getMonitors } from "#lib/remote/monitors.remote.js";

export async function load() {
	const monitors = await getMonitors();
	return { monitors };
}
