/**
 * Applies pending migrations from ./drizzle using drizzle-orm's migrator.
 *
 * Deliberately does not import src/lib/server/db — that module imports
 * $app/environment and only resolves inside SvelteKit's build.
 *
 * This exists so the runtime image does not need drizzle-kit. drizzle-kit pulls
 * esbuild, which put ~275MB and 35 CVE-carrying binaries into the production
 * image; drizzle-orm is already a production dependency and pulls neither.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

// max: 1 — the migrator runs statements sequentially and takes an advisory lock.
// A pool would let a second connection observe a half-applied migration.
const client = postgres(DATABASE_URL, { max: 1 });

try {
	await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
	console.log("migrations applied");
} catch (error) {
	console.error("migration failed:", error);
	process.exitCode = 1;
} finally {
	await client.end();
}
