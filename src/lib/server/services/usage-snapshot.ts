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
export interface OrganizationUsageSnapshot {
	organizationId: string;
	polarCustomerId: string;
	monitors: number;
	statusPages: number;
	teamMembers: number;
}

/**
 * Summed resource counts for one Polar customer at a point in time.
 *
 * A Polar customer is keyed by the better-auth user ID, and one user may own
 * several organizations (up to `ORGANIZATION_LIMIT_PER_USER`), so a single
 * customer's counts are the sum across every organization it owns —
 * `organizationId` does not survive that aggregation.
 */
export interface CustomerUsageSnapshot {
	polarCustomerId: string;
	monitors: number;
	statusPages: number;
	teamMembers: number;
	/** How many organizations this customer's totals span. */
	organizationCount: number;
}

/**
 * Reads current resource counts for every organization that has a Polar
 * customer, one row per organization.
 *
 * Organizations without a Polar customer (the free tier — customers are
 * created lazily at first checkout) are excluded by the query rather than
 * filtered afterwards, so there is no path that produces an unattributable
 * event.
 */
export async function collectUsageSnapshots(db: Db): Promise<OrganizationUsageSnapshot[]> {
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

/**
 * Sums per-organization rows into one row per Polar customer.
 *
 * A Polar customer may own several organizations (up to
 * `ORGANIZATION_LIMIT_PER_USER`), and Polar's `max` aggregation over
 * per-organization events would report the largest single organization's
 * usage instead of the customer's total — this collapses that ambiguity
 * before anything is reported. A customer with exactly one organization
 * passes through unchanged, with `organizationCount: 1`.
 *
 * Pure and synchronous so it can be unit tested without the database.
 */
export function sumByCustomer(rows: OrganizationUsageSnapshot[]): CustomerUsageSnapshot[] {
	const byCustomer = new Map<string, CustomerUsageSnapshot>();

	for (const row of rows) {
		const existing = byCustomer.get(row.polarCustomerId);
		if (existing) {
			existing.monitors += row.monitors;
			existing.statusPages += row.statusPages;
			existing.teamMembers += row.teamMembers;
			existing.organizationCount += 1;
		} else {
			byCustomer.set(row.polarCustomerId, {
				polarCustomerId: row.polarCustomerId,
				monitors: row.monitors,
				statusPages: row.statusPages,
				teamMembers: row.teamMembers,
				organizationCount: 1,
			});
		}
	}

	return Array.from(byCustomer.values());
}
