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
// Assumes `subscription` is queried unaliased (as it is below, including
// inside the `perOrganization` CTE); if it's ever queried through an alias,
// this hardcoded qualifier will no longer match.
const outerOrganizationId = sql.raw(
	`"${getTableName(subscription)}"."${subscription.organizationId.name}"`,
);

/**
 * Summed resource counts for one Polar customer at a point in time.
 *
 * A Polar customer is keyed by the better-auth user ID, and one user may own
 * several organizations (up to `ORGANIZATION_LIMIT_PER_USER`), so a single
 * customer's counts are the sum across every organization it owns —
 * `organizationId` does not survive that aggregation.
 */
export interface UsageSnapshot {
	polarCustomerId: string;
	monitors: number;
	statusPages: number;
	teamMembers: number;
	/** How many organizations this customer's totals span. */
	organizationCount: number;
}

/**
 * Reads current resource counts for every Polar customer that owns at least
 * one organization, summed across all organizations that customer owns.
 *
 * Organizations without a Polar customer (the free tier — customers are
 * created lazily at first checkout) are excluded by the query rather than
 * filtered afterwards, so there is no path that produces an unattributable
 * event.
 */
export async function collectUsageSnapshots(db: Db): Promise<UsageSnapshot[]> {
	// Per-organization counts first, as a CTE, then grouped and summed by
	// customer — grouping directly in the outer query would require the
	// correlated subqueries to reference a per-group organization_id, which
	// doesn't exist once several organizations share a group.
	const perOrganization = db.$with("per_organization").as(
		db
			.select({
				polarCustomerId: subscription.polarCustomerId,
				monitors:
					sql<string>`(select count(*) from ${monitor} where ${monitor.organizationId} = ${outerOrganizationId})`.as(
						"monitors",
					),
				statusPages:
					sql<string>`(select count(*) from ${statusPage} where ${statusPage.organizationId} = ${outerOrganizationId})`.as(
						"status_pages",
					),
				teamMembers:
					sql<string>`(select count(*) from ${member} where ${member.organizationId} = ${outerOrganizationId})`.as(
						"team_members",
					),
			})
			.from(subscription)
			.where(isNotNull(subscription.polarCustomerId)),
	);

	const rows = await db
		.with(perOrganization)
		.select({
			polarCustomerId: perOrganization.polarCustomerId,
			monitors: sql<string>`sum(${perOrganization.monitors})`,
			statusPages: sql<string>`sum(${perOrganization.statusPages})`,
			teamMembers: sql<string>`sum(${perOrganization.teamMembers})`,
			organizationCount: sql<string>`count(*)`,
		})
		.from(perOrganization)
		.groupBy(perOrganization.polarCustomerId);

	// postgres-js returns bigint counts as strings.
	return rows.map((row) => ({
		polarCustomerId: row.polarCustomerId as string,
		monitors: Number(row.monitors),
		statusPages: Number(row.statusPages),
		teamMembers: Number(row.teamMembers),
		organizationCount: Number(row.organizationCount),
	}));
}
