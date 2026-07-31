import * as schema from "$lib/server/db/schema";
import { logger } from "$lib/server/logger";
import { polarClient } from "$lib/server/polar";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { collectUsageSnapshots, type UsageSnapshot } from "./usage-snapshot";

type Db = PostgresJsDatabase<typeof schema>;

/** Return shape of the Polar SDK's `events.ingest`, isolated so tests can supply a double. */
type IngestResult = Awaited<ReturnType<typeof polarClient.events.ingest>>;
type IngestFn = (events: ReturnType<typeof toIngestEvent>[]) => Promise<IngestResult>;

/**
 * Meter event names. These must match the meter filters configured in Polar;
 * `scripts/polar-usage-meters.sh` provisions them.
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
 *
 * A Polar customer may in turn own several organizations (up to
 * `ORGANIZATION_LIMIT_PER_USER`), so `collectUsageSnapshots` sums counts per
 * customer before this ever runs — one event per customer, not per
 * organization. `organization_count` records how many organizations each
 * event's totals span.
 */
export class MeterService {
	private readonly enabled: boolean;

	constructor(
		private readonly db: Db,
		private readonly ingest: IngestFn = (events) => polarClient.events.ingest({ events }),
		private readonly chunkSize: number = INGEST_CHUNK_SIZE,
	) {
		// Self-hosted installations have no Polar organization to report to.
		this.enabled = process.env.SELF_HOSTED !== "true" && Boolean(process.env.POLAR_ACCESS_TOKEN);
	}

	/**
	 * Emits one usage snapshot per Polar customer, summed across every
	 * organization that customer owns.
	 * Returns the number of snapshots Polar reports as newly inserted. In
	 * practice this equals the snapshot count: `toIngestEvent` sets neither
	 * `externalId` nor `timestamp`, so Polar's dedup-on-`external_id` never
	 * matches and nothing is ever skipped as a duplicate.
	 *
	 * Never throws: a metering outage — whether the snapshot query or the Polar
	 * ingest call — must not fail the maintenance job that calls this. Failures
	 * are logged with enough context to tell a partial ingest from a total one.
	 */
	async reportUsageSnapshots(): Promise<number> {
		if (!this.enabled) return 0;

		let snapshots: UsageSnapshot[];
		try {
			snapshots = await collectUsageSnapshots(this.db);
		} catch (error) {
			logger.error({ error }, "Failed to collect usage snapshots for Polar metering");
			return 0;
		}
		if (snapshots.length === 0) return 0;

		let ingested = 0;

		for (let offset = 0; offset < snapshots.length; offset += this.chunkSize) {
			const chunk = snapshots.slice(offset, offset + this.chunkSize);
			try {
				const response = await this.ingest(chunk.map(toIngestEvent));
				// Trust the SDK's count of what it actually inserted (duplicates are
				// skipped, not inserted) but tolerate a malformed response rather than
				// silently reporting zero for a chunk that did ingest.
				ingested += typeof response.inserted === "number" ? response.inserted : chunk.length;
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
			organization_count: snapshot.organizationCount,
		},
	};
}
