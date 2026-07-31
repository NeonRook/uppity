import { member } from "$lib/server/db/auth-schema";
import * as schema from "$lib/server/db/schema";
import { monitor, statusPage, subscription } from "$lib/server/db/schema";
import { getTableName, isNotNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

type Db = PostgresJsDatabase<typeof schema>;

// Drizzle renders a bare Column reference inside a `sql` template as just its
// (unqualified) name. Inside a correlated subquery that shares a column name
// with its own FROM table — organization_id, in every case here — that
// resolves to the subquery's own row instead of the outer one, silently
// turning the correlation into a self-comparison that matches everything.
// Qualifying the outer reference by table name avoids that.
// Assumes `subscription` is queried unaliased (as it is below); if it's ever
// queried through an alias, this hardcoded qualifier will no longer match.
const outerOrganizationId = sql.raw(
	`"${getTableName(subscription)}"."${subscription.organizationId.name}"`,
);

/** Absolute resource counts for one organization at a point in time. */
export interface UsageSnapshot {
	organizationId: string;
	polarCustomerId: string;
	monitors: number;
	statusPages: number;
	teamMembers: number;
}

/**
 * Reads current resource counts for every organization that has a Polar customer.
 *
 * Organizations without one (the free tier — customers are created lazily at
 * first checkout) are excluded by the query rather than filtered afterwards, so
 * there is no path that produces an unattributable event.
 */
export async function collectUsageSnapshots(db: Db): Promise<UsageSnapshot[]> {
	const rows = await db
		.select({
			organizationId: subscription.organizationId,
			polarCustomerId: subscription.polarCustomerId,
			monitors: sql<string>`(select count(*) from ${monitor} where ${monitor.organizationId} = ${outerOrganizationId})`,
			statusPages: sql<string>`(select count(*) from ${statusPage} where ${statusPage.organizationId} = ${outerOrganizationId})`,
			teamMembers: sql<string>`(select count(*) from ${member} where ${member.organizationId} = ${outerOrganizationId})`,
		})
		.from(subscription)
		.where(isNotNull(subscription.polarCustomerId));

	// postgres-js returns bigint counts as strings.
	return rows.map((row) => ({
		organizationId: row.organizationId,
		polarCustomerId: row.polarCustomerId as string,
		monitors: Number(row.monitors),
		statusPages: Number(row.statusPages),
		teamMembers: Number(row.teamMembers),
	}));
}
