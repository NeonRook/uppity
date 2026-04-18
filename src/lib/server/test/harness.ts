import { resolve } from "node:path";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import * as schema from "../db/schema";

export interface TestDb {
	db: PostgresJsDatabase<typeof schema>;
	client: postgres.Sql;
	url: string;
	listen(channel: string, handler: (payload: string) => void): Promise<() => Promise<void>>;
}

export const TEMPLATE_DB = "uppity_test_template";

const SAFE_IDENT = /^[a-z][a-z0-9_]{0,62}$/;

function assertSafeIdent(name: string): void {
	if (!SAFE_IDENT.test(name)) {
		throw new Error(`Unsafe database identifier: ${name}`);
	}
}

export function adminUrlFrom(rawUrl: string): string {
	return buildUrl(rawUrl, "postgres");
}

export function buildUrl(rawUrl: string, dbName: string): string {
	const url = new URL(rawUrl);
	if (!url.pathname || url.pathname === "/") {
		throw new Error("DATABASE_URL must include a database name in the path");
	}
	url.pathname = `/${dbName}`;
	return url.toString();
}

export function requireDatabaseUrl(): string {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL must be set for integration tests");
	}
	return url;
}

async function withAdminClient<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
	const adminUrl = adminUrlFrom(requireDatabaseUrl());
	const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
	try {
		return await fn(sql);
	} finally {
		await sql.end({ timeout: 5 });
	}
}

export async function createEmptyDatabase(name: string): Promise<void> {
	assertSafeIdent(name);
	await withAdminClient(async (sql) => {
		await sql.unsafe(`CREATE DATABASE "${name}"`);
	});
}

export async function createFromTemplate(name: string, template: string): Promise<void> {
	assertSafeIdent(name);
	assertSafeIdent(template);
	await withAdminClient(async (sql) => {
		await sql.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
	});
}

export async function dropDatabase(name: string): Promise<void> {
	assertSafeIdent(name);
	await withAdminClient(async (sql) => {
		await sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
	});
}

export async function migrateTemplate(url: string): Promise<void> {
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	const db = drizzle(sql, { schema });
	try {
		await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
	} finally {
		await sql.end({ timeout: 5 });
	}
}

export function makeListen(client: postgres.Sql): TestDb["listen"] {
	return async (channel, handler) => {
		const sub = await client.listen(channel, handler);
		return async () => {
			await sub.unlisten();
		};
	};
}
