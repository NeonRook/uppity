import { getIncidents } from "#lib/remote/incidents.remote.js";

export async function load({ url }) {
	const includeResolved = url.searchParams.get("resolved") === "true";
	const incidents = await getIncidents({ includeResolved });
	return { incidents, includeResolved };
}
