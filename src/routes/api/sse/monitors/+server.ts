import { db } from "$lib/server/db";
import { monitorStatus, monitor } from "$lib/server/db/schema";
import { addConnection, removeConnection } from "$lib/server/sse";
import { eq } from "drizzle-orm";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.session?.activeOrganizationId) {
		return new Response("Unauthorized", { status: 401 });
	}

	const organizationId = locals.session.activeOrganizationId;

	const stream = new ReadableStream({
		start(controller) {
			// Add connection to map
			addConnection(organizationId, controller);

			// Send initial status
			void sendInitialStatus(controller, organizationId);

			// Cleanup on close
			request.signal.addEventListener("abort", () => {
				removeConnection(organizationId, controller);
			});
		},
		cancel() {
			// Cleanup handled by abort event
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
};

async function sendInitialStatus(
	controller: ReadableStreamDefaultController,
	organizationId: string,
) {
	try {
		const statuses = await db
			.select({
				monitorId: monitorStatus.monitorId,
				status: monitorStatus.status,
				lastCheckAt: monitorStatus.lastCheckAt,
				consecutiveFailures: monitorStatus.consecutiveFailures,
				uptimePercent24h: monitorStatus.uptimePercent24h,
				avgResponseTimeMs24h: monitorStatus.avgResponseTimeMs24h,
			})
			.from(monitorStatus)
			.innerJoin(monitor, eq(monitorStatus.monitorId, monitor.id))
			.where(eq(monitor.organizationId, organizationId));

		const message = `data: ${JSON.stringify({ type: "initial", statuses })}\n\n`;
		controller.enqueue(new TextEncoder().encode(message));
	} catch (error) {
		console.error("Failed to send initial status:", error);
	}
}
