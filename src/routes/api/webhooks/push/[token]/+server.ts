import { error } from "@sveltejs/kit";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "#lib/server/db/index.js";
import { monitor, monitorCheck, monitorStatus } from "#lib/server/db/schema.js";

import type { RequestHandler } from "./$types";

// SvelteKit answers HEAD with the GET handler's headers and no body.
export const GET: RequestHandler = async ({ params }) => {
	const [mon] = await db.select().from(monitor).where(eq(monitor.pushToken, params.token)).limit(1);

	if (!mon) {
		error(404, "Invalid push token");
	}

	if (mon.type !== "push") {
		error(400, "Monitor is not a push type");
	}

	if (!mon.active) {
		error(400, "Monitor is not active");
	}

	const now = new Date();

	await db.insert(monitorCheck).values({
		id: nanoid(),
		monitorId: mon.id,
		status: "up",
		responseTimeMs: 0,
		checkedAt: now,
	});

	await db
		.update(monitorStatus)
		.set({
			status: "up",
			lastCheckAt: now,
			lastStatusChange: sql`CASE WHEN ${monitorStatus.status} = 'down' THEN ${sql.param(now, monitorStatus.lastStatusChange)} ELSE ${monitorStatus.lastStatusChange} END`,
			consecutiveFailures: 0,
			updatedAt: now,
		})
		.where(eq(monitorStatus.monitorId, mon.id));

	return Response.json({
		ok: true,
		monitor: mon.name,
		receivedAt: now.toISOString(),
	});
};

export const POST = GET;
