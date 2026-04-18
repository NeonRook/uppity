import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { describe, it, expect } from "vitest";

import { organization } from "../../lib/server/db/auth-schema";
import * as schema from "../../lib/server/db/schema";
import { notificationEvent } from "../../lib/server/db/schema";
import { processBacklog } from "./processor";

const {TEST_DATABASE_URL} = process.env;

describe.skipIf(!TEST_DATABASE_URL)("notifier integration (real Postgres)", () => {
	it("processes a pending event end-to-end via backlog sweep", async () => {
		const client = postgres(TEST_DATABASE_URL!);
		const db = drizzle(client, { schema });

		// Need an organization — grab any existing one, or fail fast
		const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
		if (!org) {
			await client.end();
			throw new Error(
				"TEST_DATABASE_URL has no organization rows — seed one first",
			);
		}

		const eventId = `test-${nanoid()}`;
		await db.insert(notificationEvent).values({
			id: eventId,
			organizationId: org.id,
			type: "monitor_down",
			payload: {
				previousStatus: "up",
				newStatus: "down",
				consecutiveFailures: 1,
				checkId: "test-check",
			},
			status: "pending",
		});

		const processed = await processBacklog(db, "startup", () =>
			// Minimal builder stub — we don't care about wide events here
			({
				set: () => {},
				merge: () => {},
				emit: () => {},
				setSuccess: () => {},
				setError: () => {},
			}) as never,
		);

		expect(processed).toBeGreaterThanOrEqual(1);

		const [row] = await db
			.select()
			.from(notificationEvent)
			.where(eq(notificationEvent.id, eventId))
			.limit(1);

		expect(row?.status).toBe("processed");
		expect(row?.processedAt).not.toBeNull();

		// Cleanup
		await db.delete(notificationEvent).where(eq(notificationEvent.id, eventId));
		await client.end();
	}, 15_000);
});
