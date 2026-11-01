import { readFileSync } from "node:fs";

import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import { organization } from "../db/auth-schema";
import {
	emailSuppression,
	statusPage,
	statusPageSubscriber,
	unsolicitedMailSend,
} from "../db/schema";
import type { SubscriptionConfirmation } from "../subscriber-email";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedOrg } from "../test/seed";
import {
	CONFIRMATION_TTL_HOURS,
	deleteExpiredUnconfirmedSubscribers,
	deleteSuppressedSubscribers,
	RESEND_INTERVAL_MS,
	StatusPageSubscriberService,
} from "./status-page-subscriber.service";

const HOUR_MS = 60 * 60_000;

async function setup(
	drizzleDb: TestDb["db"],
	cap?: { base: number; percentOfConfirmed: number; max: number },
) {
	const orgId = await seedOrg(drizzleDb);
	const suffix = nanoid().toLowerCase();
	const page = { id: `sp-${suffix}`, organizationId: orgId };
	await drizzleDb.insert(statusPage).values({ ...page, name: "Acme", slug: `acme-${suffix}` });

	const sent: SubscriptionConfirmation[] = [];
	const send = vi.fn(async (c: SubscriptionConfirmation) => {
		sent.push(c);
	});
	return {
		page,
		sent,
		send,
		service: new StatusPageSubscriberService(drizzleDb, send, cap),
	};
}

afterEach(() => {
	vi.unstubAllEnvs();
});

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

	test("a suppressed address gets no confirmation and no row, and the answer is the same", async ({
		db,
	}) => {
		const { page, sent, service } = await setup(db.db);
		await db.db.insert(emailSuppression).values({ email: "gone@example.com", reason: "complaint" });

		expect(await service.subscribe(page, "GONE@example.com")).toBe("sent");

		expect(sent).toHaveLength(0);
		const rows = await db.db
			.select()
			.from(statusPageSubscriber)
			.where(eq(statusPageSubscriber.email, "gone@example.com"));
		expect(rows).toHaveLength(0);
	});

	test("a suppressed subscriber is deleted after retention, and stays suppressed", async ({
		db,
	}) => {
		const { page, sent, service } = await setup(db.db);
		const old = `old-${nanoid().toLowerCase()}@example.com`;
		const recent = `recent-${nanoid().toLowerCase()}@example.com`;
		await service.subscribe(page, old);
		await service.subscribe(page, recent);
		await service.confirm(page.id, sent[0].token);
		await service.confirm(page.id, sent[1].token);
		await db.db.insert(emailSuppression).values([
			{
				email: old,
				reason: "bounce",
				suppressedAt: new Date(Date.now() - 91 * 24 * HOUR_MS),
			},
			{ email: recent, reason: "bounce" },
		]);

		expect(await deleteSuppressedSubscribers(db.db)).toBe(1);

		const left = await db.db
			.select()
			.from(statusPageSubscriber)
			.where(eq(statusPageSubscriber.statusPageId, page.id));
		expect(left.map((row) => row.email)).toEqual([recent]);
		const kept = await db.db.select().from(emailSuppression).where(eq(emailSuppression.email, old));
		expect(kept).toHaveLength(1);
	});

	test("a failed send can be retried at once", async ({ db }) => {
		const { page, sent, send, service } = await setup(db.db);
		send.mockRejectedValueOnce(new Error("SMTP down"));

		await expect(service.subscribe(page, "visitor@example.com")).rejects.toThrow("SMTP down");
		await service.subscribe(page, "visitor@example.com");

		expect(sent).toHaveLength(1);
	});

	test("a page over its daily confirmations sends nothing more", async ({ db }) => {
		const { page, sent, service } = await setup(db.db, { base: 2, percentOfConfirmed: 0, max: 10 });

		expect(await service.subscribe(page, "a@example.com")).toBe("sent");
		expect(await service.subscribe(page, "b@example.com")).toBe("sent");
		expect(await service.subscribe(page, "c@example.com")).toBe("capped");

		expect(sent.map((c) => c.email)).toEqual(["a@example.com", "b@example.com"]);
	});

	test("confirmed subscribers raise the daily cap above the base", async ({ db }) => {
		const { page, sent, service } = await setup(db.db, {
			base: 1,
			percentOfConfirmed: 100,
			max: 2,
		});
		const subscribeAndConfirm = async (email: string) => {
			await service.subscribe(page, email);
			await service.confirm(page.id, sent.at(-1)!.token);
		};

		await subscribeAndConfirm("a@example.com");
		// One sent against a base of 1: capped until confirmed subscribers lift it.
		expect(await service.subscribe(page, "b@example.com")).toBe("capped");

		for (const email of ["c@example.com", "d@example.com", "e@example.com"]) {
			await db.db.insert(statusPageSubscriber).values({
				id: nanoid(),
				statusPageId: page.id,
				email,
				token: nanoid(),
				verifiedAt: new Date(),
			});
		}
		// Four confirmed at 100% would allow four; the max allows two, one of which is used.
		expect(await service.subscribe(page, "b@example.com")).toBe("sent");
		expect(await service.subscribe(page, "f@example.com")).toBe("capped");
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

const setSwitch = (drizzleDb: TestDb["db"], organizationId: string, enabled: boolean) =>
	drizzleDb
		.update(organization)
		.set({ subscriberEmailEnabled: enabled })
		.where(eq(organization.id, organizationId));

const switchState = async (drizzleDb: TestDb["db"], organizationId: string) => {
	const [org] = await drizzleDb
		.select({ enabled: organization.subscriberEmailEnabled })
		.from(organization)
		.where(eq(organization.id, organizationId));
	return org.enabled;
};

const insertSubscriber = (drizzleDb: TestDb["db"], statusPageId: string) =>
	drizzleDb.insert(statusPageSubscriber).values({
		id: nanoid(),
		statusPageId,
		email: `${nanoid().toLowerCase()}@example.com`,
		token: nanoid(),
	});

describe("subscriber email switch", () => {
	beforeEach(() => {
		vi.stubEnv("UPPITY_GATE_SUBSCRIBER_EMAIL", "true");
	});

	test("off refuses every address alike and records nothing", async ({ db }) => {
		const { page, send, service } = await setup(db.db);
		const suppressed = `${nanoid().toLowerCase()}@example.com`;
		await db.db.insert(emailSuppression).values({ email: suppressed, reason: "bounce" });
		const fresh = `${nanoid().toLowerCase()}@example.com`;

		expect(await service.subscribe(page, suppressed)).toBe("paused");
		expect(await service.subscribe(page, fresh)).toBe("paused");

		expect(send).not.toHaveBeenCalled();
		const rows = await db.db
			.select()
			.from(statusPageSubscriber)
			.where(eq(statusPageSubscriber.statusPageId, page.id));
		expect(rows).toHaveLength(0);
		const logged = await db.db
			.select()
			.from(unsolicitedMailSend)
			.where(inArray(unsolicitedMailSend.email, [suppressed, fresh]));
		expect(logged).toHaveLength(0);
	});

	test("off stops a waiting confirmation link, and unsubscribing still works", async ({ db }) => {
		const { page, sent, service } = await setup(db.db);
		await setSwitch(db.db, page.organizationId, true);
		await service.subscribe(page, "visitor@example.com");
		const [{ token }] = sent;
		expect(await service.pageIdFor(token)).toBe(page.id);

		await setSwitch(db.db, page.organizationId, false);

		expect(await service.pageIdFor(token)).toBeUndefined();
		await service.unsubscribe(page.id, token);
		expect(await service.lookup(page.id, token)).toBeNull();
	});

	test("a subscribe that overlaps staff turning it off waits, then is refused", async ({ db }) => {
		const { page, send, service } = await setup(db.db);
		await setSwitch(db.db, page.organizationId, true);

		let result: Promise<string> | undefined;
		await db.db.transaction(async (tx) => {
			await tx
				.update(organization)
				.set({ subscriberEmailEnabled: false })
				.where(eq(organization.id, page.organizationId));
			result = service.subscribe(page, "visitor@example.com");
			await new Promise((done) => setTimeout(done, 100));
		});

		expect(await result).toBe("paused");
		expect(send).not.toHaveBeenCalled();
	});

	test("self-hosted instances ignore it", async ({ db }) => {
		vi.stubEnv("SELF_HOSTED", "true");
		const { page, sent, service } = await setup(db.db);

		expect(await service.subscribe(page, "visitor@example.com")).toBe("sent");

		expect(await service.pageIdFor(sent[0].token)).toBe(page.id);
		expect(await service.accepts(page.organizationId)).toBe(true);
	});

	test("an instance without the setting ignores it", async ({ db }) => {
		vi.stubEnv("UPPITY_GATE_SUBSCRIBER_EMAIL", "");
		const { page, sent, service } = await setup(db.db);

		expect(await service.subscribe(page, "visitor@example.com")).toBe("sent");

		expect(await service.pageIdFor(sent[0].token)).toBe(page.id);
	});

	test("a new subscriber leaves the switch as it was", async ({ db }) => {
		const { page } = await setup(db.db);

		await insertSubscriber(db.db, page.id);
		expect(await switchState(db.db, page.organizationId)).toBe(false);

		await setSwitch(db.db, page.organizationId, true);
		await insertSubscriber(db.db, page.id);
		expect(await switchState(db.db, page.organizationId)).toBe(true);
	});

	test("a staff off survives a new subscriber", async ({ db }) => {
		const { page } = await setup(db.db);
		await setSwitch(db.db, page.organizationId, true);
		await setSwitch(db.db, page.organizationId, false);

		await insertSubscriber(db.db, page.id);

		expect(await switchState(db.db, page.organizationId)).toBe(false);
	});
});

describe("subscriber email backfill", () => {
	const backfill = readFileSync("drizzle/0033_subscriber_email_enabled.sql", "utf8")
		.split("--> statement-breakpoint")
		.at(-1);

	test("turns on organizations with a subscriber on any page, and no others", async ({ db }) => {
		const seed = async (subscriber: { confirmed: boolean } | null, isPublic = true) => {
			const orgId = await seedOrg(db.db);
			const id = `sp-${nanoid().toLowerCase()}`;
			await db.db
				.insert(statusPage)
				.values({ id, organizationId: orgId, name: "Acme", slug: id, isPublic });
			if (subscriber) {
				await db.db.insert(statusPageSubscriber).values({
					id: nanoid(),
					statusPageId: id,
					email: "visitor@example.com",
					token: nanoid(),
					verifiedAt: subscriber.confirmed ? new Date() : null,
				});
			}
			return orgId;
		};
		const confirmed = await seed({ confirmed: true });
		const onPrivatePage = await seed({ confirmed: true }, false);
		const pendingOnly = await seed({ confirmed: false });
		const none = await seed(null);

		await db.client.unsafe(backfill ?? "");

		expect(await switchState(db.db, confirmed)).toBe(true);
		expect(await switchState(db.db, onPrivatePage)).toBe(true);
		expect(await switchState(db.db, pendingOnly)).toBe(true);
		expect(await switchState(db.db, none)).toBe(false);
	});
});
