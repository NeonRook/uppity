import {
	buildUrl,
	createEmptyDatabase,
	dropDatabase,
	migrateTemplate,
	requireDatabaseUrl,
	TEMPLATE_DB,
} from "./harness";

export async function setup(): Promise<void> {
	const rawUrl = requireDatabaseUrl();
	await dropDatabase(TEMPLATE_DB);
	await createEmptyDatabase(TEMPLATE_DB);
	await migrateTemplate(buildUrl(rawUrl, TEMPLATE_DB));
}

export async function teardown(): Promise<void> {
	await dropDatabase(TEMPLATE_DB);
}
