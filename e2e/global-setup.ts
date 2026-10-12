import { createEmptyDatabase, dropDatabase, migrateTemplate } from "../src/lib/server/test/harness";
import { E2E_DATABASE_URL, E2E_DB } from "./env";

export default async function globalSetup(): Promise<void> {
	await dropDatabase(E2E_DB);
	await createEmptyDatabase(E2E_DB);
	await migrateTemplate(E2E_DATABASE_URL);
}
