import { building } from "$app/environment";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// Use Bun.env directly to ensure runtime resolution
// $env/dynamic/private can get baked in at build time by svelte-adapter-bun
const { DATABASE_URL } = Bun.env;

if (!DATABASE_URL && !building) throw new Error("DATABASE_URL is not set");

const client = postgres(DATABASE_URL!);

export const db = drizzle(client, { schema });
