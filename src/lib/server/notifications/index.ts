import { db } from "$lib/server/db";

import { NotificationService } from "./service";

export { NotificationService } from "./service";
export const notificationService = new NotificationService(db);
