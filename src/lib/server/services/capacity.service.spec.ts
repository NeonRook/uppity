import { and, eq, isNotNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { monitor, subscription } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedMember, seedOrg, seedSubscription } from "../test/seed";
import {
	clearIfWithinCeiling,
	resumeAfterRaise,
	runCapacityGrace,
	type CapacityNotice,
} from "./capacity.service";
import { SubscriptionService } from "./subscription.service";

const DAY = 86_400_000;
const start = new Date("2026-10-01T12:00:00Z");
const at = (days: number) => new Date(start.getTime() + days * DAY);

/** Seeds `count` monitors named `M0`, `M1`, ... with strictly increasing creation times. */
async function seedAged(
	db: TestDb["db"],
	orgId: string,
	count: number,
	overrides: Partial<typeof monitor.$inferInsert> = {},
): Promise<void> {
	const existing = await db.$count(monitor, eq(monitor.organizationId, orgId));
	await db.insert(monitor).values(
		Array.from({ length: count }, (_, i) => ({
			id: `mon-${nanoid()}`,
			organizationId: orgId,
			name: `M${existing + i}`,
			type: "http",
			url: "https://example.com",
			intervalSeconds: 300,
			timeoutSeconds: 30,
			createdAt: new Date(start.getTime() - (1000 - existing - i) * 60_000),
			...overrides,
		})),
	);
}

async function names(db: TestDb["db"], orgId: string, where: "active" | "capacity" | "paused") {
	const condition = {
		active: eq(monitor.active, true),
		capacity: isNotNull(monitor.capacityPausedAt),
		paused: eq(monitor.active, false),
	}[where];
	const rows = await db
		.select({ name: monitor.name })
		.from(monitor)
		.where(and(eq(monitor.organizationId, orgId), condition))
		.orderBy(monitor.createdAt);
	return rows.map((r) => r.name);
}

async function clock(db: TestDb["db"], orgId: string) {
	const [row] = await db
		.select({
			since: subscription.overCapacitySince,
			notice: subscription.capacityNotice,
		})
		.from(subscription)
		.where(eq(subscription.organizationId, orgId));
	return row;
}

/** A free-plan organization (ceiling 20) with an owner, an admin, and a plain member. */
async function seedOverOrg(db: TestDb["db"], monitors: number) {
	const orgId = await seedOrg(db);
	await seedSubscription(db, orgId, { planId: "free" });
	const owner = await seedMember(db, orgId, "owner");
	const admin = await seedMember(db, orgId, "admin");
	await seedMember(db, orgId, "member");
	await seedAged(db, orgId, monitors);
	return { orgId, recipients: [`${owner}@example.com`, `${admin}@example.com`].toSorted() };
}

/** Records what `send` delivers. The database is shared, so `only` filters to one organization. */
function recorder(only?: string[]) {
	const sent: { to: string[]; notice: CapacityNotice }[] = [];
	const send = vi.fn(async (to: string[], notice: CapacityNotice) => {
		const sorted = to.toSorted();
		if (!only || sorted.join() === only.join()) sent.push({ to: sorted, notice });
	});
	return { sent, send };
}

describe("capacity grace period", () => {
	beforeAll(() => {
		vi.stubEnv("SELF_HOSTED", "");
	});

	afterAll(() => {
		vi.unstubAllEnvs();
	});

	test("an organization within its ceiling starts no clock and gets no email", async ({ db }) => {
		const { orgId, recipients } = await seedOverOrg(db.db, 20);
		const { sent, send } = recorder(recipients);

		await runCapacityGrace(db.db, send, start);

		expect(sent).toEqual([]);
		expect((await clock(db.db, orgId)).since).toBeNull();
	});

	test("going over starts the clock and warns owners and admins", async ({ db }) => {
		const { orgId, recipients } = await seedOverOrg(db.db, 23);
		const { sent, send } = recorder(recipients);

		const result = await runCapacityGrace(db.db, send, start);

		expect(result.clocks_started).toBeGreaterThanOrEqual(1);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toEqual(recipients);
		expect(sent[0].notice).toMatchObject({
			kind: "over",
			active: 23,
			ceiling: 20,
			pauseAt: at(14),
			toPause: ["M22", "M21", "M20"],
		});
		expect(await clock(db.db, orgId)).toEqual({ since: start, notice: "over" });
	});

	test("warns at a week and a day left, then pauses the newest a day after the last warning", async ({
		db,
	}) => {
		const { orgId, recipients } = await seedOverOrg(db.db, 23);
		const { sent, send } = recorder(recipients);

		await runCapacityGrace(db.db, send, start);
		await runCapacityGrace(db.db, send, at(1));
		await runCapacityGrace(db.db, send, at(7));
		await runCapacityGrace(db.db, send, at(13));
		await runCapacityGrace(db.db, send, at(13.5));
		expect(sent.map((s) => s.notice.kind)).toEqual(["over", "week", "day"]);
		expect(await names(db.db, orgId, "paused")).toEqual([]);

		await runCapacityGrace(db.db, send, at(14));

		expect(sent.at(-1)?.notice).toMatchObject({ kind: "paused", paused: ["M22", "M21", "M20"] });
		expect(await names(db.db, orgId, "capacity")).toEqual(["M20", "M21", "M22"]);
		expect(await names(db.db, orgId, "active")).toHaveLength(20);

		// Back within the ceiling, the next pass ends the grace period.
		await runCapacityGrace(db.db, send, at(14.1));
		expect(await clock(db.db, orgId)).toEqual({ since: null, notice: null });
	});

	test("a failed email records nothing, and the pause waits a day after the final warning lands", async ({
		db,
	}) => {
		const { orgId, recipients } = await seedOverOrg(db.db, 22);
		const { sent, send } = recorder(recipients);
		await runCapacityGrace(db.db, send, start);

		const failing = vi.fn(async () => {
			throw new Error("smtp down");
		});
		const failed = await runCapacityGrace(db.db, failing, at(13));
		expect(failed.failures).toContain(`${orgId}: smtp down`);
		expect((await clock(db.db, orgId)).notice).toBe("over");

		// The deadline passes with the outage. The final warning goes out late, and the
		// pause holds for a full day after it.
		await runCapacityGrace(db.db, failing, at(14));
		await runCapacityGrace(db.db, send, at(15));
		expect(sent.at(-1)?.notice.kind).toBe("day");
		await runCapacityGrace(db.db, send, at(15.9));
		expect(await names(db.db, orgId, "paused")).toEqual([]);

		await runCapacityGrace(db.db, send, at(16));
		expect(await names(db.db, orgId, "capacity")).toEqual(["M20", "M21"]);
	});

	test("one organization failing does not stop the others", async ({ db }) => {
		const first = await seedOverOrg(db.db, 21);
		const second = await seedOverOrg(db.db, 21);
		const send = vi.fn(async (to: string[]) => {
			if (to.includes(first.recipients[0])) throw new Error("rejected");
		});

		const result = await runCapacityGrace(db.db, send, start);

		expect(result.failures.filter((f) => f.startsWith(first.orgId))).toHaveLength(1);
		expect((await clock(db.db, second.orgId)).notice).toBe("over");
	});

	test("pausing back within the ceiling clears the clock", async ({ db }) => {
		const { orgId } = await seedOverOrg(db.db, 21);
		await runCapacityGrace(db.db, recorder().send, start);

		await db.db
			.update(monitor)
			.set({ active: false })
			.where(and(eq(monitor.organizationId, orgId), eq(monitor.name, "M0")));
		await clearIfWithinCeiling(db.db, orgId);

		expect(await clock(db.db, orgId)).toEqual({ since: null, notice: null });
	});

	test("self-hosted organizations are never over capacity", async ({ db }) => {
		await seedOverOrg(db.db, 30);
		const { send } = recorder();

		vi.stubEnv("SELF_HOSTED", "true");
		try {
			const result = await runCapacityGrace(db.db, send, start);
			expect(result.organizations_over).toBe(0);
		} finally {
			vi.stubEnv("SELF_HOSTED", "");
		}
		expect(send).not.toHaveBeenCalled();
	});
});

/** 19 active, one the customer paused, and three we paused for capacity. */
async function seedPausedOrg(db: TestDb["db"]) {
	const orgId = await seedOrg(db);
	await seedSubscription(db, orgId, { planId: "free" });
	await seedAged(db, orgId, 19);
	await seedAged(db, orgId, 1, { active: false });
	await seedAged(db, orgId, 3, { active: false, capacityPausedAt: start });
	return orgId;
}

describe("resumeAfterRaise", () => {
	beforeAll(() => {
		vi.stubEnv("SELF_HOSTED", "");
	});

	afterAll(() => {
		vi.unstubAllEnvs();
	});

	test("takes no more than the rise, leaving a slot the customer freed", async ({ db }) => {
		const orgId = await seedPausedOrg(db.db);

		expect(await resumeAfterRaise(db.db, orgId, 20, 21)).toBe(1);

		expect(await names(db.db, orgId, "capacity")).toEqual(["M21", "M22"]);
		expect(await names(db.db, orgId, "active")).toHaveLength(20);
	});

	test("never resumes a monitor the customer paused", async ({ db }) => {
		const orgId = await seedPausedOrg(db.db);

		expect(await resumeAfterRaise(db.db, orgId, 20, 50)).toBe(3);

		expect(await names(db.db, orgId, "paused")).toEqual(["M19"]);
	});

	test("does nothing when the ceiling did not rise", async ({ db }) => {
		const orgId = await seedPausedOrg(db.db);

		expect(await resumeAfterRaise(db.db, orgId, 20, 20)).toBe(0);
		expect(await resumeAfterRaise(db.db, orgId, 50, 20)).toBe(0);
		expect(await names(db.db, orgId, "capacity")).toHaveLength(3);
	});

	test("buying blocks resumes paused monitors on the same request", async ({ db }) => {
		const orgId = await seedOrg(db.db);
		await seedSubscription(db.db, orgId, { planId: "uppity", blocks: 0 });
		await seedAged(db.db, orgId, 50);
		await seedAged(db.db, orgId, 2, { active: false, capacityPausedAt: start });

		const result = await new SubscriptionService(db.db).setBlocks(orgId, 1);

		expect(result.ok).toBe(true);
		expect(await names(db.db, orgId, "capacity")).toEqual([]);
		expect(await names(db.db, orgId, "active")).toHaveLength(52);
	});
});
