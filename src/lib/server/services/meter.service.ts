import * as schema from "$lib/server/db/schema";
import { logger } from "$lib/server/logger";
import { polarClient } from "$lib/server/polar";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import {
	collectUsageSnapshots,
	sumByCustomer,
	type CustomerUsageSnapshot,
	type OrganizationUsageSnapshot,
} from "./usage-snapshot";

type Db = PostgresJsDatabase<typeof schema>;

/** Return shape of the Polar SDK's `events.ingest`, isolated so tests can supply a double. */
type IngestResult = Awaited<ReturnType<typeof polarClient.events.ingest>>;
type IngestEvent = ReturnType<typeof toIngestEvent> | ReturnType<typeof toOrgIngestEvent>;
type IngestFn = (events: IngestEvent[]) => Promise<IngestResult>;

/**
 * Meter event names. `USAGE_SNAPSHOT` must match the meter filters configured
 * in Polar; `scripts/polar-usage-meters.sh` provisions them.
 *
 * `USAGE_SNAPSHOT_ORG` has no meter pointed at it — see `toOrgIngestEvent`.
 */
export const METER_EVENTS = {
	USAGE_SNAPSHOT: "usage_snapshot",
	USAGE_SNAPSHOT_ORG: "usage_snapshot_org",
} as const;

/** Keep ingest batches well clear of Polar's per-request limit. */
const INGEST_CHUNK_SIZE = 100;

/** How many events each stream ingested, kept separate because they count different things. */
export interface UsageSnapshotReport {
	/** `usage_snapshot` events ingested — the summed, billable stream Polar's meters key on. */
	customerSnapshots: number;
	/** `usage_snapshot_org` events ingested — the unmetered per-organization audit trail. */
	organizationSnapshots: number;
}

const EMPTY_REPORT: UsageSnapshotReport = { customerSnapshots: 0, organizationSnapshots: 0 };

/**
 * Reports organization usage to Polar meters.
 *
 * Local limit checking remains the source of truth for enforcement; this exists
 * so usage is visible and billable in Polar.
 *
 * Two event streams are emitted from one `collectUsageSnapshots` query, both
 * keyed by `customerId` — Polar's internal customer UUID, stored on
 * `subscription.polarCustomerId`. Neither can be keyed by organization ID:
 * `external_customer_id` is already claimed by `@polar-sh/better-auth`, which
 * hardcodes it to the better-auth user ID. Polar accepts an unrecognised
 * external ID with a 200 and stores the event with a null customer, so getting
 * this wrong fails silently rather than loudly.
 *
 * - `usage_snapshot`: one event per Polar customer, summed across every
 *   organization that customer owns (via `sumByCustomer`). A Polar customer
 *   may own several organizations (up to `ORGANIZATION_LIMIT_PER_USER`), and
 *   emitting one event per organization here would let `max` aggregation
 *   report the largest organization's usage instead of the customer's total.
 *   This is the stream the three Polar meters are configured against.
 * - `usage_snapshot_org`: one event per organization, unsummed. It exists
 *   purely as an audit trail so per-organization usage stays queryable in
 *   Polar's event stream once `usage_snapshot` has collapsed that detail away.
 *   No meter should ever key on this event — doing so would double-count
 *   relative to the summed stream for any customer with more than one
 *   organization.
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
	 * Emits both usage-snapshot streams and returns how many events each
	 * ingested. The two counts are kept separate rather than summed: they
	 * count different things (billable customers vs. audited organizations),
	 * and the maintenance job that calls this reports `records_processed`
	 * from the result, which should stay a meaningful count of one kind of
	 * record rather than an opaque total of two.
	 *
	 * Never throws: a metering outage — whether the snapshot query or either
	 * Polar ingest call — must not fail the maintenance job that calls this.
	 * The two streams are ingested independently, each in its own chunked
	 * loop with its own try/catch per chunk, so a failure in one never stops
	 * the other from being attempted or reported.
	 */
	async reportUsageSnapshots(): Promise<UsageSnapshotReport> {
		if (!this.enabled) return EMPTY_REPORT;

		let rows: OrganizationUsageSnapshot[];
		try {
			rows = await collectUsageSnapshots(this.db);
		} catch (error) {
			logger.error({ error }, "Failed to collect usage snapshots for Polar metering");
			return EMPTY_REPORT;
		}
		if (rows.length === 0) return EMPTY_REPORT;

		const customerSnapshots = await this.ingestInChunks(
			sumByCustomer(rows),
			toIngestEvent,
			METER_EVENTS.USAGE_SNAPSHOT,
		);
		const organizationSnapshots = await this.ingestInChunks(
			rows,
			toOrgIngestEvent,
			METER_EVENTS.USAGE_SNAPSHOT_ORG,
		);

		return { customerSnapshots, organizationSnapshots };
	}

	/**
	 * Ingests one stream of events in chunks, tolerating a failed chunk
	 * without losing the others or throwing.
	 *
	 * Returns the count Polar reports as newly inserted. In practice this
	 * equals the item count: `toIngestEvent`/`toOrgIngestEvent` set neither
	 * `externalId` nor `timestamp`, so Polar's dedup-on-`external_id` never
	 * matches and nothing is ever skipped as a duplicate.
	 */
	private async ingestInChunks<T>(
		items: T[],
		toEvent: (item: T) => IngestEvent,
		streamName: string,
	): Promise<number> {
		let ingested = 0;

		for (let offset = 0; offset < items.length; offset += this.chunkSize) {
			const chunk = items.slice(offset, offset + this.chunkSize);
			try {
				const response = await this.ingest(chunk.map(toEvent));
				// Trust the SDK's count of what it actually inserted (duplicates are
				// skipped, not inserted) but tolerate a malformed response rather than
				// silently reporting zero for a chunk that did ingest.
				ingested += typeof response.inserted === "number" ? response.inserted : chunk.length;
			} catch (error) {
				logger.error(
					{ error, chunk_size: chunk.length, offset, stream: streamName },
					"Failed to ingest Polar usage events",
				);
			}
		}

		return ingested;
	}
}

function toIngestEvent(snapshot: CustomerUsageSnapshot) {
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

function toOrgIngestEvent(row: OrganizationUsageSnapshot) {
	return {
		name: METER_EVENTS.USAGE_SNAPSHOT_ORG,
		customerId: row.polarCustomerId,
		metadata: {
			organization_id: row.organizationId,
			monitors: row.monitors,
			status_pages: row.statusPages,
			team_members: row.teamMembers,
		},
	};
}
