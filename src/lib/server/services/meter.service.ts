import * as schema from "$lib/server/db/schema";
import { logger } from "$lib/server/logger";
import { polarClient } from "$lib/server/polar";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { collectUsageSnapshots, type UsageSnapshot } from "./usage-snapshot";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Meter event names. These must match the meter filters configured in Polar;
 * `docs/superpowers/pricing/polar-usage-meters.sh` provisions them.
 */
export const METER_EVENTS = {
	USAGE_SNAPSHOT: "usage_snapshot",
} as const;

/** Keep ingest batches well clear of Polar's per-request limit. */
const INGEST_CHUNK_SIZE = 100;

/**
 * Reports organization usage to Polar meters.
 *
 * Local limit checking remains the source of truth for enforcement; this exists
 * so usage is visible and billable in Polar.
 *
 * Events are keyed by `customerId` — Polar's internal customer UUID, stored on
 * `subscription.polarCustomerId`. They cannot be keyed by organization ID:
 * `external_customer_id` is already claimed by `@polar-sh/better-auth`, which
 * hardcodes it to the better-auth user ID. Polar accepts an unrecognised
 * external ID with a 200 and stores the event with a null customer, so getting
 * this wrong fails silently rather than loudly.
 */
export class MeterService {
	private readonly enabled: boolean;

	constructor(private readonly db: Db) {
		// Self-hosted installations have no Polar organization to report to.
		this.enabled = process.env.SELF_HOSTED !== "true" && Boolean(process.env.POLAR_ACCESS_TOKEN);
	}

	/**
	 * Emits one usage snapshot per billed organization.
	 * Returns the number of snapshots ingested.
	 *
	 * Never throws: a metering outage must not fail the maintenance job that
	 * calls it. Failures are logged with the chunk size so a partial ingest is
	 * distinguishable from a total one.
	 */
	async reportUsageSnapshots(): Promise<number> {
		if (!this.enabled) return 0;

		const snapshots = await collectUsageSnapshots(this.db);
		if (snapshots.length === 0) return 0;

		let ingested = 0;

		for (let offset = 0; offset < snapshots.length; offset += INGEST_CHUNK_SIZE) {
			const chunk = snapshots.slice(offset, offset + INGEST_CHUNK_SIZE);
			try {
				await polarClient.events.ingest({ events: chunk.map(toIngestEvent) });
				ingested += chunk.length;
			} catch (error) {
				logger.error(
					{ error, chunk_size: chunk.length, offset },
					"Failed to ingest Polar usage snapshots",
				);
			}
		}

		return ingested;
	}
}

function toIngestEvent(snapshot: UsageSnapshot) {
	return {
		name: METER_EVENTS.USAGE_SNAPSHOT,
		customerId: snapshot.polarCustomerId,
		metadata: {
			monitors: snapshot.monitors,
			status_pages: snapshot.statusPages,
			team_members: snapshot.teamMembers,
		},
	};
}
