import { db } from "$lib/server/db";
import { logger } from "$lib/server/logger";
import { json } from "@sveltejs/kit";
import { sql } from "drizzle-orm";

export async function GET() {
	try {
		await db.execute(sql`SELECT 1`);

		return json({
			status: "healthy",
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		logger.error({ error }, "Health check failed");
		return json({ status: "unhealthy", error: "Database connection failed" }, { status: 503 });
	}
}
