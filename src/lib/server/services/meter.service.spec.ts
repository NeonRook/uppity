import { isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { organization } from "../db/auth-schema";
import * as schema from "../db/schema";
import { subscription } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { METER_EVENTS, MeterService } from "./meter.service";

/** Seeds one organization and its subscription, wired to the given Polar customer. */
async function seedOrganizationWithCustomer(
	drizzleDb: TestDb["db"],
	polarCustomerId: string,
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
		planId: "uppity",
		status: "active",
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
		expect(event?.name).toBe(METER_EVENTS.USAGE_SNAPSHOT);
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

	test("emits one usage_snapshot_org event per organization, each carrying its own organization_id", async ({
		db,
	}) => {
		// Two organizations sharing one Polar customer: the customer stream
		// collapses them into a single summed event, but the organization
		// stream must still carry one event per organization.
		const sharedCustomerId = `polar-cust-shared-${nanoid()}`;
		const first = await seedOrganizationWithCustomer(db.db, sharedCustomerId);
		const second = await seedOrganizationWithCustomer(db.db, sharedCustomerId);

		const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 0 });
		const service = new MeterService(db.db, ingest, 100);

		await service.reportUsageSnapshots();

		const orgEventCalls = ingest.mock.calls
			.flatMap((call) => call[0] as IngestedEvent[])
			.filter(
				(e) => e.name === METER_EVENTS.USAGE_SNAPSHOT_ORG && e.customerId === sharedCustomerId,
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
		expect(eventNames).toEqual(
			new Set([METER_EVENTS.USAGE_SNAPSHOT, METER_EVENTS.USAGE_SNAPSHOT_ORG]),
		);
	});
});
