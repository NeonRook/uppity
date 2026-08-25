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

// The migrator takes no lock of its own, so two copies pointed at one database
// race. Exactly one process may run this.
//
// It also issues a single statement sequence on a single connection, so max: 1.
// A pool would add nothing here but idle sockets to close on the way out.
const client = postgres(DATABASE_URL, { max: 1 });

try {
	await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
	console.log("migrations applied");
} catch (error) {
	console.error("migration failed:", error);
	process.exitCode = 1;
} finally {
	// end() rejects on an already-closed socket and can hang if the server stopped
	// responding. Either would mask the migration result — and this runs as Railway's
	// preDeployCommand, where a hang blocks the deploy rather than failing it.
	try {
		await client.end({ timeout: 5 });
	} catch (error) {
		console.warn("could not close the database connection cleanly:", error);
	}
}
