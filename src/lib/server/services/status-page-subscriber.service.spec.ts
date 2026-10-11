import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, vi } from "vitest";

import { statusPage, statusPageSubscriber } from "../db/schema";
import type { SubscriptionConfirmation } from "../subscriber-email";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedOrg } from "../test/seed";
import {
	CONFIRMATION_TTL_HOURS,
	deleteExpiredUnconfirmedSubscribers,
	RESEND_INTERVAL_MS,
	StatusPageSubscriberService,
} from "./status-page-subscriber.service";

const HOUR_MS = 60 * 60_000;

async function setup(drizzleDb: TestDb["db"]) {
	const orgId = await seedOrg(drizzleDb);
	const suffix = nanoid().toLowerCase();
	const page = { id: `sp-${suffix}`, name: "Acme", slug: `acme-${suffix}` };
	await drizzleDb.insert(statusPage).values({ ...page, organizationId: orgId });

	const sent: SubscriptionConfirmation[] = [];
	const send = vi.fn(async (c: SubscriptionConfirmation) => {
		sent.push(c);
	});
	return { page, sent, send, service: new StatusPageSubscriberService(drizzleDb, send) };
}

const backdate = (drizzleDb: TestDb["db"], token: string, ms: number) =>
	drizzleDb
		.update(statusPageSubscriber)
		.set({ confirmationSentAt: new Date(Date.now() - ms) })
		.where(eq(statusPageSubscriber.token, token));

describe("StatusPageSubscriberService", () => {
	test("subscribe sends a confirmation to the normalized address", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);

		await service.subscribe(page, "  Visitor@Example.com ");

		expect(sent).toHaveLength(1);
		expect(sent[0].email).toBe("visitor@example.com");
		expect(await service.lookup(page.id, sent[0].token)).toBe("pending");
	});

	test("a repeat within the resend interval sends nothing", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);

		await service.subscribe(page, "visitor@example.com");
		await service.subscribe(page, "VISITOR@example.com");

		expect(sent).toHaveLength(1);
	});

	test("a repeat after the resend interval resends the same token", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);

		await service.subscribe(page, "visitor@example.com");
		await backdate(db.db, sent[0].token, RESEND_INTERVAL_MS + 1000);
		await service.subscribe(page, "visitor@example.com");

		expect(sent.map((c) => c.token)).toEqual([sent[0].token, sent[0].token]);
	});

	test("a confirmed address is never mailed again", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);

		await service.subscribe(page, "visitor@example.com");
		expect(await service.confirm(page.id, sent[0].token)).toBe(true);
		await backdate(db.db, sent[0].token, RESEND_INTERVAL_MS + 1000);
		await service.subscribe(page, "visitor@example.com");

		expect(sent).toHaveLength(1);
	});

	test("a failed send can be retried at once", async ({ db }) => {
		const { page, sent, send, service } = await setup(db.db);
		send.mockRejectedValueOnce(new Error("SMTP down"));

		await expect(service.subscribe(page, "visitor@example.com")).rejects.toThrow("SMTP down");
		await service.subscribe(page, "visitor@example.com");

		expect(sent).toHaveLength(1);
	});

	test("confirm is idempotent and scoped to the page", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);
		await service.subscribe(page, "visitor@example.com");
		const [{ token }] = sent;

		expect(await service.confirm("other-page", token)).toBe(false);
		expect(await service.confirm(page.id, token)).toBe(true);
		expect(await service.confirm(page.id, token)).toBe(true);
		expect(await service.lookup(page.id, token)).toBe("confirmed");
	});

	test("an expired link neither looks up nor confirms", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);
		await service.subscribe(page, "visitor@example.com");
		const [{ token }] = sent;
		await backdate(db.db, token, CONFIRMATION_TTL_HOURS * HOUR_MS + 1000);

		expect(await service.lookup(page.id, token)).toBeNull();
		expect(await service.confirm(page.id, token)).toBe(false);
	});

	test("unsubscribe deletes the subscriber", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);
		await service.subscribe(page, "visitor@example.com");
		await service.confirm(page.id, sent[0].token);

		await service.unsubscribe(page.id, sent[0].token);

		expect(await service.lookup(page.id, sent[0].token)).toBeNull();
	});

	test("cleanup deletes expired unconfirmed addresses only", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);
		for (const email of ["expired@example.com", "fresh@example.com", "kept@example.com"]) {
			await service.subscribe(page, email);
		}
		const [expired, fresh, kept] = sent.map((c) => c.token);
		await service.confirm(page.id, kept);
		await backdate(db.db, expired, CONFIRMATION_TTL_HOURS * HOUR_MS + 1000);
		await backdate(db.db, kept, CONFIRMATION_TTL_HOURS * HOUR_MS + 1000);

		expect(await deleteExpiredUnconfirmedSubscribers(db.db)).toBeGreaterThanOrEqual(1);

		const remaining = await db.db
			.select({ token: statusPageSubscriber.token })
			.from(statusPageSubscriber)
			.where(eq(statusPageSubscriber.statusPageId, page.id));
		expect(remaining.map((r) => r.token).toSorted()).toEqual([fresh, kept].toSorted());
	});
});
