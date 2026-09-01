import { BLOCK_ELIGIBLE_PLAN_IDS, DEFAULT_PLAN_ID } from "$lib/constants/plans";
import { member } from "$lib/server/db/auth-schema";
import * as schema from "$lib/server/db/schema";
import { monitor, statusPage, subscription } from "$lib/server/db/schema";
import { and, eq, getTableName, inArray, isNotNull, ne, sql } from "drizzle-orm";
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
 * Reads current resource counts for every organization that is both billed
 * and actively on a paid plan, one row per organization.
 *
 * Organizations without a Polar customer (the free tier — customers are
 * created lazily at first checkout) are excluded by the query rather than
 * filtered afterwards, so there is no path that produces an unattributable
 * event.
 *
 * Organizations on the free plan are excluded the same way, by `planId`
 * rather than `status`. `downgradeToFree` and cancellation both route
 * through `syncFromPolar`, which never clears `polarCustomerId` — it carries
 * `?? existing.polarCustomerId` forward — so a revoked or downgraded
 * organization keeps its Polar customer ID forever and would otherwise stay
 * in every future snapshot. Filtering on `status` instead would wrongly drop
 * `past_due` organizations, which are still consuming resources and still
 * owe money and so must stay metered; only a `planId` of `free` means the
 * organization is no longer on a paid plan.
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
		.where(and(isNotNull(subscription.polarCustomerId), ne(subscription.planId, DEFAULT_PLAN_ID)));

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

/** Purchased capacity blocks held by one organization. */
export interface OrganizationBlockSnapshot {
	organizationId: string;
	polarCustomerId: string;
	blocks: number;
}

/**
 * Purchased capacity blocks held by one Polar customer, summed across every
 * block-eligible organization it owns.
 */
export interface CustomerBlockSnapshot {
	polarCustomerId: string;
	blocks: number;
	/** How many organizations this customer's total spans. */
	organizationCount: number;
}

/**
 * Reads the current block count for every organization whose plan is billed by
 * capacity, one row per organization. `polarCustomerId` narrows the read to one
 * customer.
 *
 * This must keep being called for organizations whose count has not changed: Polar
 * meters reset every billing period and aggregate `max`, so a standing purchase that
 * goes unreported in a period meters zero and stops being billed.
 *
 * Rows holding zero blocks are kept, but not because a zero can correct anything —
 * `max` is monotone, so a zero sample can never lower an aggregate in any window. It
 * keeps the customer's meter row current and leaves the checked-and-found-nothing case
 * visible in Polar's event stream, and it costs one event. Treat it as insurance
 * against rollover semantics nobody here has verified, not as a fix.
 */
export async function collectBlockSnapshots(
	db: Db,
	polarCustomerId?: string,
): Promise<OrganizationBlockSnapshot[]> {
	const rows = await db
		.select({
			organizationId: subscription.organizationId,
			polarCustomerId: subscription.polarCustomerId,
			blocks: subscription.blocks,
		})
		.from(subscription)
		.where(
			and(
				isNotNull(subscription.polarCustomerId),
				inArray(subscription.planId, [...BLOCK_ELIGIBLE_PLAN_IDS]),
				polarCustomerId ? eq(subscription.polarCustomerId, polarCustomerId) : undefined,
			),
		);

	return rows.map((row) => ({
		organizationId: row.organizationId,
		polarCustomerId: row.polarCustomerId as string,
		blocks: row.blocks,
	}));
}

/**
 * Sums per-organization block counts into one row per Polar customer, the same collapse
 * `sumByCustomer` performs: Polar aggregates a meter per customer, and one customer may
 * own several organizations.
 */
export function sumBlocksByCustomer(rows: OrganizationBlockSnapshot[]): CustomerBlockSnapshot[] {
	const byCustomer = new Map<string, CustomerBlockSnapshot>();

	for (const row of rows) {
		const existing = byCustomer.get(row.polarCustomerId);
		if (existing) {
			existing.blocks += row.blocks;
			existing.organizationCount += 1;
		} else {
			byCustomer.set(row.polarCustomerId, {
				polarCustomerId: row.polarCustomerId,
				blocks: row.blocks,
				organizationCount: 1,
			});
		}
	}

	return Array.from(byCustomer.values());
}
