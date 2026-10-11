import { fail, redirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { message, superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";

import { API_KEYS_PER_ORGANIZATION } from "#lib/constants/api.js";
import { createApiKeySchema } from "#lib/schemas/settings.js";
import { requestsPerMinute } from "#lib/server/api-auth.js";
import { auth } from "#lib/server/auth.js";
import { member } from "#lib/server/db/auth-schema.js";
import { db } from "#lib/server/db/index.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

import type { Actions, PageServerLoad } from "./$types";

const MANAGER_ROLES: ReadonlySet<string> = new Set(["owner", "admin"]);

async function canManage(organizationId: string, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
	return row !== undefined && MANAGER_ROLES.has(row.role);
}

export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) redirect(302, "/login");
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) redirect(302, "/settings");

	const [keys, limits, manage, form] = await Promise.all([
		auth.api.listApiKeys({ headers: request.headers, query: { organizationId } }),
		subscriptionService.getEffectiveLimits(organizationId),
		canManage(organizationId, locals.user.id),
		superValidate(valibot(createApiKeySchema)),
	]);

	return {
		form,
		canManage: manage,
		access: limits.apiAccess,
		requestsPerMinute: requestsPerMinute(limits),
		maxKeys: API_KEYS_PER_ORGANIZATION,
		keys: keys.apiKeys.map((key) => ({
			id: key.id,
			name: key.name,
			start: key.start,
			createdAt: key.createdAt,
			lastRequest: key.lastRequest,
		})),
	};
};

function refusal(error: unknown): string {
	if (error instanceof APIError && typeof error.body?.message === "string")
		return error.body.message;
	throw error;
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const organizationId = locals.session?.activeOrganizationId;
		if (!organizationId) return fail(400, { error: "No active organization" });

		const form = await superValidate(request, valibot(createApiKeySchema));
		if (!form.valid) return fail(400, { form });

		try {
			const created = await auth.api.createApiKey({
				headers: request.headers,
				body: { name: form.data.name, organizationId },
			});
			// The only time the full key is readable; it is stored hashed.
			return message(form, { createdKey: created.key });
		} catch (error) {
			return message(form, { error: refusal(error) }, { status: 400 });
		}
	},

	revoke: async ({ request }) => {
		const keyId = (await request.formData()).get("keyId");
		if (typeof keyId !== "string" || keyId === "") return fail(400, { error: "Missing key" });

		try {
			await auth.api.deleteApiKey({ headers: request.headers, body: { keyId } });
			return { revoked: true };
		} catch (error) {
			return fail(400, { error: refusal(error) });
		}
	},
};
