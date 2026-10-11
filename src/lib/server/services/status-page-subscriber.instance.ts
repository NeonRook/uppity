import { db } from "#lib/server/db/index.js";
import { sendSubscriptionConfirmation } from "#lib/server/subscriber-email.js";

import { StatusPageSubscriberService } from "./status-page-subscriber.service";

export const statusPageSubscriberService = new StatusPageSubscriberService(
	db,
	sendSubscriptionConfirmation,
);
