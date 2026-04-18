import { getIncidents } from "$lib/remote/incidents.remote";

export async function load({ url }) {
	const includeResolved = url.searchParams.get("resolved") === "true";
	const incidents = await getIncidents({ includeResolved }).run();
	return { incidents, includeResolved };
}
