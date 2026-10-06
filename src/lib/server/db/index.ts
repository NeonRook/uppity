import { building } from "$app/env";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// process.env rather than $env/dynamic/private, which the build can inline.
const { DATABASE_URL } = process.env;

if (!DATABASE_URL && !building) throw new Error("DATABASE_URL is not set");

const client = postgres(DATABASE_URL);

export const db = drizzle(client, { schema });

/** Structural so tests can pass a harness database in place of the app one. */
export type Db = PostgresJsDatabase<typeof schema>;

/** A `db` handle or a transaction handle. */
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
