import { db } from "$lib/server/db";
import { monitor, monitorCheck, monitorStatus } from "$lib/server/db/schema";
import { json, error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
	return handlePush(params.token);
};

export const POST: RequestHandler = async ({ params }) => {
	return handlePush(params.token);
};

export const HEAD: RequestHandler = async ({ params }) => {
	return handlePush(params.token);
};

async function handlePush(token: string) {
	// Find monitor by push token
	const [mon] = await db.select().from(monitor).where(eq(monitor.pushToken, token)).limit(1);

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

	// Record the check
	await db.insert(monitorCheck).values({
		id: nanoid(),
		monitorId: mon.id,
		status: "up",
		responseTimeMs: 0,
		checkedAt: now,
	});

	// Update monitor status
	const [currentStatus] = await db
		.select()
		.from(monitorStatus)
		.where(eq(monitorStatus.monitorId, mon.id))
		.limit(1);

	const wasDown = currentStatus?.status === "down";

	await db
		.update(monitorStatus)
		.set({
			status: "up",
			lastCheckAt: now,
			lastStatusChange: wasDown ? now : currentStatus?.lastStatusChange,
			consecutiveFailures: 0,
			updatedAt: now,
		})
		.where(eq(monitorStatus.monitorId, mon.id));

	return json({
		ok: true,
		monitor: mon.name,
		receivedAt: now.toISOString(),
	});
}
