import { drizzle } from "drizzle-orm/postgres-js";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { organization } from "../db/auth-schema";
import * as schema from "../db/schema";
import { subscription } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { MeterService } from "./meter.service";

async function seedBilledOrganization(drizzleDb: TestDb["db"]): Promise<string> {
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
		polarCustomerId: `polar-cust-${suffix}`,
	});
	return orgId;
}

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
		await seedBilledOrganization(db.db);
		await seedBilledOrganization(db.db);
		await seedBilledOrganization(db.db);

		const ingest = vi
			.fn()
			.mockRejectedValueOnce(new Error("Polar unavailable"))
			.mockResolvedValue({ inserted: 1, duplicates: 0 });

		// chunkSize 1 forces three separate ingest calls, one per organization.
		const service = new MeterService(db.db, ingest, 1);

		const result = await service.reportUsageSnapshots();

		expect(result).toBe(2);
		expect(ingest).toHaveBeenCalledTimes(3);
	});

	test("a snapshot query failure resolves to 0 instead of throwing", async ({ db }) => {
		// A dedicated, already-closed connection reproduces a real query failure
		// (dropped connection) without touching the shared file-scoped client.
		const client = postgres(db.url, { max: 1, onnotice: () => {} });
		await client.end();
		const brokenDb = drizzle(client, { schema });

		const ingest = vi.fn();
		const service = new MeterService(brokenDb, ingest);

		const result = await service.reportUsageSnapshots();

		expect(result).toBe(0);
		expect(ingest).not.toHaveBeenCalled();
	});

	test("the returned count reflects inserted, not chunk length, when Polar skips duplicates", async ({
		db,
	}) => {
		await seedBilledOrganization(db.db);
		await seedBilledOrganization(db.db);

		// Both organizations land in a single chunk; Polar reports one insert and
		// one duplicate, so the total must be 1, not the chunk length of 2.
		const ingest = vi.fn().mockResolvedValue({ inserted: 1, duplicates: 1 });
		const service = new MeterService(db.db, ingest, 10);

		const result = await service.reportUsageSnapshots();

		expect(result).toBe(1);
	});
});
