import { isNotNull, ne, or } from "drizzle-orm";

import { notificationChannel } from "../db/schema";

/** Email channels alert only a confirmed address. Other types have no recipient to confirm. */
export const channelConfirmed = or(
	ne(notificationChannel.type, "email"),
	isNotNull(notificationChannel.verifiedAt),
);
