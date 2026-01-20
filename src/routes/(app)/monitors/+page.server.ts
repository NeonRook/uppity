import { deleteMonitorSchema, toggleMonitorSchema } from "$lib/schemas/monitor";
import { db } from "$lib/server/db";
import { monitor, monitorStatus } from "$lib/server/db/schema";
import { monitorService } from "$lib/server/services/monitor.service";
import { fail } from "@sveltejs/kit";
import { eq, desc } from "drizzle-orm";
import { superValidate, message } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session?.activeOrganizationId) {
		return { monitors: [] };
	}

	const monitors = await db
		.select({
			id: monitor.id,
			name: monitor.name,
			description: monitor.description,
			type: monitor.type,
			url: monitor.url,
			hostname: monitor.hostname,
			port: monitor.port,
			active: monitor.active,
			intervalSeconds: monitor.intervalSeconds,
			createdAt: monitor.createdAt,
			status: monitorStatus.status,
			lastCheckAt: monitorStatus.lastCheckAt,
			consecutiveFailures: monitorStatus.consecutiveFailures,
			uptimePercent24h: monitorStatus.uptimePercent24h,
			avgResponseTimeMs24h: monitorStatus.avgResponseTimeMs24h,
		})
		.from(monitor)
		.leftJoin(monitorStatus, eq(monitor.id, monitorStatus.monitorId))
		.where(eq(monitor.organizationId, locals.session.activeOrganizationId))
		.orderBy(desc(monitor.createdAt));

	return { monitors };
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(deleteMonitorSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const deleted = await monitorService.delete(
			form.data.monitorId,
			locals.session.activeOrganizationId,
		);

		if (!deleted) {
			return message(form, "Monitor not found", { status: 404 });
		}

		return message(form, "Monitor deleted");
	},

	toggle: async ({ request, locals }) => {
		if (!locals.session?.activeOrganizationId) {
			return fail(401, { error: "Not authenticated" });
		}

		const form = await superValidate(request, valibot(toggleMonitorSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		const updated = await monitorService.toggleActive(
			form.data.monitorId,
			locals.session.activeOrganizationId,
		);

		if (!updated) {
			return message(form, "Monitor not found", { status: 404 });
		}

		return message(form, updated.active ? "Monitor resumed" : "Monitor paused");
	},
};
