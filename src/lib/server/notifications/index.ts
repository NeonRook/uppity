import { db } from "#lib/server/db/index.js";

import { NotificationService } from "./service";

export { NotificationService } from "./service";
export const notificationService = new NotificationService(db);
