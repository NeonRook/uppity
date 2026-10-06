import { db } from "#lib/server/db/index.js";

import { SubscriptionService } from "./subscription.service";

// Kept out of `subscription.service.ts` so the worker bundle can import the class
// without the web tier's database client, which depends on `$app/env`.
export const subscriptionService = new SubscriptionService(db);
