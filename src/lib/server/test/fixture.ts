import { drizzle } from "drizzle-orm/postgres-js";
import { customAlphabet } from "nanoid";
import postgres from "postgres";
import { test as baseTest } from "vitest";

import * as schema from "../db/schema";
import {
	buildUrl,
	createFromTemplate,
	dropDatabase,
	makeListen,
	requireDatabaseUrl,
	TEMPLATE_DB,
	type TestDb,
} from "./harness";

// Postgres-identifier-safe alphabet (a-z, 0-9 only) — avoids '-' from nanoid's
// default alphabet which would require quoting DDL identifiers.
const makeSuffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

export const test = baseTest.extend<{ db: TestDb }>({
	db: [
		async ({}, use) => {
			const rawUrl = requireDatabaseUrl();
			const dbName = `test_${makeSuffix()}`;
			await createFromTemplate(dbName, TEMPLATE_DB);
			const url = buildUrl(rawUrl, dbName);
			const client = postgres(url, { max: 5, onnotice: () => {} });
			const db = drizzle(client, { schema });
			const handle: TestDb = { db, client, url, listen: makeListen(client) };

			try {
				await use(handle);
			} finally {
				try {
					await client.end({ timeout: 5 });
				} catch {
					// Client already closed by test or LISTEN unsubscribe — ignore.
				}
				try {
					await dropDatabase(dbName);
				} catch (err) {
					// Backstop: don't mask test failures with teardown errors.
					// Orphan will be cleaned on next run via DROP IF EXISTS.
					console.warn(`Failed to drop test database ${dbName}:`, err);
				}
			}
		},
		{ scope: "file" },
	],
});
