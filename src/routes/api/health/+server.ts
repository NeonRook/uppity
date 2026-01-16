import { env } from "$env/dynamic/private";
import { db } from "$lib/server/db";
import { json } from "@sveltejs/kit";
import { sql } from "drizzle-orm";

export async function GET() {
	// Debug: compare $env/dynamic/private vs Bun.env
	console.log("[HEALTH DEBUG] env.BETTER_AUTH_URL:", env.BETTER_AUTH_URL);
	console.log("[HEALTH DEBUG] env.BETTER_AUTH_TRUSTED_ORIGINS:", env.BETTER_AUTH_TRUSTED_ORIGINS);
	console.log("[HEALTH DEBUG] Bun.env.BETTER_AUTH_URL:", Bun.env.BETTER_AUTH_URL);
	console.log("[HEALTH DEBUG] Bun.env.BETTER_AUTH_TRUSTED_ORIGINS:", Bun.env.BETTER_AUTH_TRUSTED_ORIGINS);

	try {
		await db.execute(sql`SELECT 1`);

		return json({
			status: "healthy",
			timestamp: new Date().toISOString(),
			debug: {
				svelteEnvBetterAuthUrl: env.BETTER_AUTH_URL,
				svelteEnvTrustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS,
				bunEnvBetterAuthUrl: Bun.env.BETTER_AUTH_URL,
				bunEnvTrustedOrigins: Bun.env.BETTER_AUTH_TRUSTED_ORIGINS,
			},
		});
	} catch (error) {
		console.error("Health check failed:", error);
		return json({ status: "unhealthy", error: "Database connection failed" }, { status: 503 });
	}
}
