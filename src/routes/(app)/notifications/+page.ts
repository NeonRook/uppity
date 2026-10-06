import { getChannels } from "#lib/remote/notifications.remote.js";

export async function load() {
	const channels = await getChannels();
	return { channels };
}
