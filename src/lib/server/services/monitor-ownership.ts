import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "#lib/server/db/schema.js";
import { monitor } from "#lib/server/db/schema.js";

/**
 * True when every id names a monitor owned by `organizationId`. Every write that
 * attaches client-supplied monitor ids to another row checks them here first.
 */
export async function monitorsBelongToOrg(
	db: Pick<PostgresJsDatabase<typeof schema>, "select">,
	organizationId: string,
	monitorIds: string[],
): Promise<boolean> {
	const unique = [...new Set(monitorIds)];
	if (unique.length === 0) return true;
	const found = await db
		.select({ id: monitor.id })
		.from(monitor)
		.where(and(eq(monitor.organizationId, organizationId), inArray(monitor.id, unique)));
	return found.length === unique.length;
}
