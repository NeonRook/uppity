import { isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { organization } from "../db/auth-schema";
import * as schema from "../db/schema";
import { monitor, subscription } from "../db/schema";
import { logger } from "../logger";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { MeterService } from "./meter.service";

// The wire-format assertions below deliberately use literal strings
// ("usage_snapshot", "usage_snapshot_org") and literal metadata key lists
// instead of the METER_EVENTS constant or a shared key-list helper. The
// three provisioned Polar meters key on the literal event name and property
// names, not on whatever this codebase happens to call them internally.
// Comparing production output against the same constant it was built from
// proves nothing — a rename of METER_EVENTS.USAGE_SNAPSHOT or a `status_pages`
// -> `statusPages` typo in `toIngestEvent` would keep these tests green while
// the meters silently read zero forever. Do not "simplify" these back to the
// constant.

/** Seeds one organization and its subscription, wired to the given Polar customer. */
async function seedOrganizationWithCustomer(
	drizzleDb: TestDb["db"],
	polarCustomerId: string,
	overrides: { planId?: string; blocks?: number } = {},
): Promise<string> {
	const suffix = nanoid();
	const orgId = `test-org-${suffix}`;
	await drizzleDb.insert(organization).values({
		id: orgId,
		name: `Test Org ${suffix}`,
		slug: `test-org-${suffix}`,
		createdAt: new Date(),
	});
	await drizzleDb.insert(subscription).values({
		id: nanoid(),
		organizationId: orgId,
		planId: overrides.planId ?? "uppity",
		status: "active",
		blocks: overrides.blocks ?? 0,
		polarCustomerId,
	});
	return orgId;
}

/** Seeds one billed organization with a unique (unshared) Polar customer ID. */
async function seedBilledOrganization(drizzleDb: TestDb["db"]): Promise<string> {
	const polarCustomerId = `polar-cust-${nanoid()}`;
	await seedOrganizationWithCustomer(drizzleDb, polarCustomerId);
	return polarCustomerId;
}

/** Seeds `count` monitors for an already-created organization. */
async function seedMonitors(drizzleDb: TestDb["db"], orgId: string, count: number): Promise<void> {
	for (let i = 0; i < count; i++) {
		await drizzleDb.insert(monitor).values({
			id: nanoid(),
			organizationId: orgId,
			name: `Monitor ${nanoid()}`,
			type: "http",
			url: "https://example.com",
		});
	}
}

type IngestedEvent = { name: string; customerId: string; metadata: Record<string, unknown> };

describe("MeterService", () => {
	// Local dev's .env sets SELF_HOSTED=true, which disables reporting entirely.
	// Force the enabled path so these tests actually exercise it.
	beforeAll(() => {
		vi.stubEnv("SELF_HOSTED", "");
		vi.stubEnv("POLAR_ACCESS_TOKEN", "test-token");
	});

	afterAll(() => {
		vi.unstubAllEnvs();
	});

	test("a chunk whose ingest rejects does not throw, and later chunks still ingest", async ({
		db,
	}) => {
		const billedOrgsBefore = await db.db
			.select()
			.from(subscription)
			.where(isNotNull(subscription.polarCustomerId));
		await seedBilledOrganization(db.db);
		await seedBilledOrganization(db.db);
		await seedBilledOrganization(db.db);
		const orgsSeededHere = 3;

		const ingest = vi
			.fn()
			.mockRejectedValueOnce(new Error("Polar unavailable"))
			.mockResolvedValue({ inserted: 1, duplicates: 0 });

		// chunkSize 1 forces one ingest call per organization present in the
		// (file-scoped, so possibly non-empty) database, not just the ones this
		// test seeded — for each of the two streams.
		const service = new MeterService(db.db, ingest, 1);

		const result = await service.reportUsageSnapshots();

		// The harness is file-scoped: rows seeded by earlier tests in this file
		// are still present, so the total organization count — and therefore the
		// call count and the successful-chunk count — must be derived rather
		// than hardcoded. Every organization here has a unique Polar customer, so
		// the customer stream has as many events as organizations. The customer
		// stream ingests first (sequential, not concurrent), so the one rejection
		// lands on its first chunk; the organization stream is entirely
		// unaffected, since it runs after the rejection has already happened.
		const totalOrgs = billedOrgsBefore.length + orgsSeededHere;
		expect(ingest).toHaveBeenCalledTimes(totalOrgs * 2);
		expect(result).toEqual({
			customerSnapshots: totalOrgs - 1,
			organizationSnapshots: totalOrgs,
		});
	});

	test("a snapshot query failure resolves to an all-zero report instead of throwing", async ({
		db,
	}) => {
		// A dedicated, already-closed connection reproduces a real query failure
		// (dropped connection) without touching the shared file-scoped client.
		const client = postgres(db.url, { max: 1, onnotice: () => {} });
		await client.end();
		const brokenDb = drizzle(client, { schema });

		const ingest = vi.fn();
		const service = new MeterService(brokenDb, ingest);

		const result = await service.reportUsageSnapshots();

		expect(result).toEqual({ customerSnapshots: 0, organizationSnapshots: 0 });
		expect(ingest).not.toHaveBeenCalled();
	});

	test("each usage_snapshot event carries organization_count in its metadata", async ({ db }) => {
		const polarCustomerId = await seedBilledOrganization(db.db);

		const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
		const service = new MeterService(db.db, ingest, 10);

		await service.reportUsageSnapshots();

		// With one billed org and chunkSize 10, everything fits in a single
		// chunk per stream: the first ingest call is the customer stream.
		const [customerEvents] = ingest.mock.calls[0] as [IngestedEvent[]];
		const event = customerEvents.find((e) => e.customerId === polarCustomerId);
		expect(event?.name).toBe("usage_snapshot");
		// Exact key set, not just presence of organization_count: a rename of
		// any property (e.g. status_pages -> statusPages) would zero that
		// meter while every other assertion here stayed green.
		expect(Object.keys(event?.metadata ?? {}).toSorted()).toEqual([
			"monitors",
			"organization_count",
			"status_pages",
			"team_members",
		]);
		expect(event?.metadata.organization_count).toBe(1);
	});

	test("the returned counts reflect inserted, not chunk length, when Polar skips duplicates", async ({
		db,
	}) => {
		await seedBilledOrganization(db.db);
		await seedBilledOrganization(db.db);

		// These two organizations, plus any already seeded earlier in this file,
		// still land in a single chunk per stream (chunkSize 10). Polar reports
		// one insert and one duplicate for each stream's chunk, so both totals
		// must be 1, not the chunk length.
		const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 1 });
		const service = new MeterService(db.db, ingest, 10);

		const result = await service.reportUsageSnapshots();

		expect(result).toEqual({ customerSnapshots: 1, organizationSnapshots: 1 });
	});

	test("sums a shared customer's organizations into one usage_snapshot event, and still emits one usage_snapshot_org event per organization", async ({
		db,
	}) => {
		// Two organizations sharing one Polar customer, seeded with distinguishable
		// monitor counts (3 and 7) so a wrong sum, a wrong pick of one org's count,
		// or an accidental average are all distinguishable from the correct 10.
		const sharedCustomerId = `polar-cust-shared-${nanoid()}`;
		const first = await seedOrganizationWithCustomer(db.db, sharedCustomerId);
		const second = await seedOrganizationWithCustomer(db.db, sharedCustomerId);
		await seedMonitors(db.db, first, 3);
		await seedMonitors(db.db, second, 7);

		const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
		const service = new MeterService(db.db, ingest, 100);

		await service.reportUsageSnapshots();

		const allEvents = ingest.mock.calls.flatMap((call) => call[0] as IngestedEvent[]);

		const customerEvents = allEvents.filter(
			(e) => e.name === "usage_snapshot" && e.customerId === sharedCustomerId,
		);
		expect(customerEvents).toHaveLength(1);
		expect(customerEvents[0]?.metadata).toMatchObject({
			monitors: 10,
			organization_count: 2,
		});

		const orgEventCalls = allEvents.filter(
			(e) => e.name === "usage_snapshot_org" && e.customerId === sharedCustomerId,
		);

		const orgIds = new Set(orgEventCalls.map((e) => e.metadata.organization_id));
		expect(orgIds).toEqual(new Set([first, second]));
		// The organization stream never carries organization_count — that field
		// only makes sense once several rows have been collapsed into one event.
		for (const event of orgEventCalls) {
			expect(event.metadata.organization_count).toBeUndefined();
		}
	});

	test("emits both the usage_snapshot and usage_snapshot_org streams in one run", async ({
		db,
	}) => {
		await seedBilledOrganization(db.db);

		const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
		const service = new MeterService(db.db, ingest, 100);

		await service.reportUsageSnapshots();

		const eventNames = new Set(
			ingest.mock.calls.flatMap((call) => call[0] as IngestedEvent[]).map((e) => e.name),
		);
		expect(eventNames).toEqual(new Set(["usage_snapshot", "usage_snapshot_org"]));
	});

	describe("capacity blocks", () => {
		test("emits monitor_blocks carrying the customer's summed block count", async ({ db }) => {
			const polarCustomerId = `polar-cust-${nanoid()}`;
			await seedOrganizationWithCustomer(db.db, polarCustomerId, { blocks: 2 });
			await seedOrganizationWithCustomer(db.db, polarCustomerId, { blocks: 3 });

			const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
			await new MeterService(db.db, ingest, 100).reportBlocks(polarCustomerId);

			const events = ingest.mock.calls.flatMap((call) => call[0] as IngestedEvent[]);
			expect(events).toEqual([
				{
					name: "monitor_blocks",
					customerId: polarCustomerId,
					metadata: { blocks: 5, organization_count: 2 },
				},
			]);
		});

		test("reports an explicit zero once the last block is removed", async ({ db }) => {
			const polarCustomerId = `polar-cust-${nanoid()}`;
			await seedOrganizationWithCustomer(db.db, polarCustomerId, { blocks: 0 });

			const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
			await new MeterService(db.db, ingest, 100).reportBlocks(polarCustomerId);

			const events = ingest.mock.calls.flatMap((call) => call[0] as IngestedEvent[]);
			expect(events).toEqual([
				{
					name: "monitor_blocks",
					customerId: polarCustomerId,
					metadata: { blocks: 0, organization_count: 1 },
				},
			]);
		});

		test("does not report a plan whose product carries no block price", async ({ db }) => {
			const polarCustomerId = `polar-cust-${nanoid()}`;
			await seedOrganizationWithCustomer(db.db, polarCustomerId, {
				planId: "dedicated",
				blocks: 4,
			});

			const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
			const result = await new MeterService(db.db, ingest, 100).reportBlocks(polarCustomerId);

			// Nothing to send is a success with nothing sent, not a failure.
			expect(result).toEqual({ ok: true, ingested: 0 });
			expect(ingest).not.toHaveBeenCalled();
		});

		test("the daily heartbeat reports every block-eligible customer, not only changed ones", async ({
			db,
		}) => {
			const polarCustomerId = `polar-cust-${nanoid()}`;
			await seedOrganizationWithCustomer(db.db, polarCustomerId, { blocks: 7 });

			const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
			await new MeterService(db.db, ingest, 100).reportBlocks();

			const events = ingest.mock.calls.flatMap((call) => call[0] as IngestedEvent[]);
			expect(events.find((e) => e.customerId === polarCustomerId)?.metadata).toEqual({
				blocks: 7,
				organization_count: 1,
			});
		});

		test("a rejected ingest reports failure rather than throwing or reading as empty", async ({
			db,
		}) => {
			const polarCustomerId = `polar-cust-${nanoid()}`;
			await seedOrganizationWithCustomer(db.db, polarCustomerId, { blocks: 1 });

			const ingest = vi.fn().mockRejectedValue(new Error("Polar unavailable"));
			const service = new MeterService(db.db, ingest, 100);

			// The route that calls this right after a purchase has to be able to retry.
			// Collapsing this into 0 would let an outage at a period boundary under-bill
			// the whole period, with the daily heartbeat already past the rollover.
			await expect(service.reportBlocks(polarCustomerId)).resolves.toEqual({
				ok: false,
				reason: "ingest_failed",
			});
		});

		test("one failed chunk fails the report even when others ingested", async ({ db }) => {
			const polarCustomerId = `polar-cust-${nanoid()}`;
			await seedOrganizationWithCustomer(db.db, polarCustomerId, { blocks: 1 });
			await seedOrganizationWithCustomer(db.db, `polar-cust-${nanoid()}`, { blocks: 1 });

			const ingest = vi
				.fn()
				.mockRejectedValueOnce(new Error("Polar unavailable"))
				.mockResolvedValue({ inserted: 1, duplicates: 0 });
			// chunkSize 1 puts each customer in its own request.
			const service = new MeterService(db.db, ingest, 1);

			const result = await service.reportBlocks();
			expect(result.ok).toBe(false);
		});

		test("a customer spanning several organizations is only flagged once it holds blocks", async ({
			db,
		}) => {
			const quiet = `polar-cust-${nanoid()}`;
			await seedOrganizationWithCustomer(db.db, quiet, { blocks: 0 });
			await seedOrganizationWithCustomer(db.db, quiet, { blocks: 0 });

			const errors = vi.spyOn(logger, "error").mockImplementation(() => {});
			try {
				const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
				await new MeterService(db.db, ingest, 100).reportBlocks(quiet);

				// Two organizations, no blocks: there is no charge to duplicate. Alerting
				// here would fire daily forever and wear out the channel the design leans on.
				const duplicateWarnings = errors.mock.calls.filter(([, message]) =>
					String(message).includes("charges may be duplicated"),
				);
				expect(duplicateWarnings).toHaveLength(0);
			} finally {
				errors.mockRestore();
			}
		});
	});
});
