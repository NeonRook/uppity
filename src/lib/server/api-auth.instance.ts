import { eq } from "drizzle-orm";

import { auth } from "#lib/server/auth.js";
import { apikey } from "#lib/server/db/auth-schema.js";
import { db } from "#lib/server/db/index.js";
import { subscriptionService } from "#lib/server/services/subscription.instance.js";

import type { ApiAuthDeps } from "./api-auth";

export const apiAuthDeps: ApiAuthDeps = {
	verify: (key) => auth.api.verifyApiKey({ body: { key } }),
	limits: (organizationId) => subscriptionService.getEffectiveLimits(organizationId),
	setRateLimit: async (keyId, max, windowMs) => {
		await db
			.update(apikey)
			.set({ rateLimitMax: max, rateLimitTimeWindow: windowMs, updatedAt: new Date() })
			.where(eq(apikey.id, keyId));
	},
};
