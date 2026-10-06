import { sql } from "drizzle-orm";

import { db } from "#lib/server/db/index.js";
import { logger } from "#lib/server/logger/index.js";

export async function GET() {
	try {
		await db.execute(sql`SELECT 1`);

		return Response.json({
			status: "healthy",
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		logger.error({ error }, "Health check failed");
		return Response.json(
			{ status: "unhealthy", error: "Database connection failed" },
			{ status: 503 },
		);
	}
}
