import { building } from "$app/environment";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// process.env rather than $env/dynamic/private, which the build can inline.
const { DATABASE_URL } = process.env;

if (!DATABASE_URL && !building) throw new Error("DATABASE_URL is not set");

const client = postgres(DATABASE_URL);

export const db = drizzle(client, { schema });
