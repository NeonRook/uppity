import { db } from "$lib/server/db";
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
		console.error("Health check failed:", error);
		return json({ status: "unhealthy", error: "Database connection failed" }, { status: 503 });
	}
}
