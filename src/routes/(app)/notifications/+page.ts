import { getChannels } from "$lib/remote/notifications.remote";

export async function load() {
	const channels = await getChannels().run();
	return { channels };
}
