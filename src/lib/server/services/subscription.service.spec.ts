import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { ORGANIZATION_MEMBERSHIP_LIMIT } from "#lib/constants/auth.js";

import { invitation } from "../db/auth-schema";
import { monitor, statusPage, subscription } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { seedMember, seedMonitors, seedOrg, seedSubscription, seedUser } from "../test/seed";
import { SubscriptionService } from "./subscription.service";

async function seedInvitation(
	drizzleDb: TestDb["db"],
	orgId: string,
	{ expired = false }: { expired?: boolean } = {},
): Promise<void> {
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + (expired ? -1 : 7));
	await drizzleDb.insert(invitation).values({
		id: nanoid(),
		organizationId: orgId,
		email: `invitee-${nanoid()}@example.com`,
		role: "member",
		status: "pending",
		expiresAt,
		createdAt: new Date(),
		inviterId: await seedUser(drizzleDb),
	});
}

/** Seeds an organization and gives it a subscription. */
async function seedSubscribed(
	drizzleDb: TestDb["db"],
	overrides: Parameters<typeof seedSubscription>[2],
): Promise<string> {
	const orgId = await seedOrg(drizzleDb);
	await seedSubscription(drizzleDb, orgId, overrides);
	return orgId;
}

describe("SubscriptionService", () => {
	// Local dev's .env might set SELF_HOSTED=true, which short-circuits every limit check to the
	// unlimited self-hosted plan. Force the plan-based code path.
	beforeAll(() => {
		vi.stubEnv("SELF_HOSTED", "");
	});

	afterAll(() => {
		vi.unstubAllEnvs();
	});

	describe("canAddMonitor", () => {
		test("under the free-plan limit allows, at the limit denies with usage/limit/message", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "free",
				status: "active",
			});

			// Free plan caps at 20 monitors — seed 19 first.
			for (let i = 0; i < 19; i++) {
				await drizzleDb.insert(monitor).values({
					id: nanoid(),
					organizationId: orgId,
					name: `Monitor ${i}`,
					type: "http",
					url: "https://example.com",
					intervalSeconds: 300,
					timeoutSeconds: 30,
				});
			}

			const underLimit = await service.canAddMonitor(orgId);
			expect(underLimit.allowed).toBe(true);
			expect(underLimit.currentUsage).toBe(19);
			expect(underLimit.limit).toBe(20);
			expect(underLimit.message).toBeUndefined();

			// Twentieth monitor fills the quota.
			await drizzleDb.insert(monitor).values({
				id: nanoid(),
				organizationId: orgId,
				name: "Monitor 20",
				type: "http",
				url: "https://example.com",
				intervalSeconds: 300,
				timeoutSeconds: 30,
			});

			const atLimit = await service.canAddMonitor(orgId);
			expect(atLimit.allowed).toBe(false);
			expect(atLimit.currentUsage).toBe(20);
			expect(atLimit.limit).toBe(20);
			expect(atLimit.message).toMatch(/limit of 20 monitors/);
		});

		test("enforcement reports the block-derived ceiling, not the plan's base 50", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 2,
			});

			const result = await service.canAddMonitor(orgId);
			expect(result.allowed).toBe(true);
			expect(result.limit).toBe(150);
		});

		test("self-hosted mode (limits.monitors = -1) short-circuits without a usage query", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			vi.stubEnv("SELF_HOSTED", "true");
			try {
				const result = await service.canAddMonitor(orgId);
				// The short-circuit branch returns { allowed: true } and nothing else —
				// no currentUsage/limit/message set. That shape is the proof the count
				// query never ran.
				expect(result).toEqual({ allowed: true });
			} finally {
				vi.stubEnv("SELF_HOSTED", "");
			}
		});
	});

	describe("canAddStatusPage", () => {
		test("denies at the free-plan limit of 1", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "free",
				status: "active",
			});

			await drizzleDb.insert(statusPage).values({
				id: nanoid(),
				organizationId: orgId,
				name: "Primary",
				slug: `sp-${nanoid()}`,
			});

			const result = await service.canAddStatusPage(orgId);
			expect(result.allowed).toBe(false);
			expect(result.currentUsage).toBe(1);
			expect(result.limit).toBe(1);
			expect(result.message).toMatch(/limit of 1 status pages/);
		});
	});

	describe("isNotificationChannelAllowed", () => {
		test("free plan allows email but denies slack", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "free",
				status: "active",
			});

			const email = await service.isNotificationChannelAllowed(orgId, "email");
			expect(email.allowed).toBe(true);
			expect(email.message).toBeUndefined();

			const slack = await service.isNotificationChannelAllowed(orgId, "slack");
			expect(slack.allowed).toBe(false);
			expect(slack.message).toMatch(/slack notifications are not available/i);
		});
	});

	describe("isCheckIntervalAllowed", () => {
		test("free plan rejects sub-120s intervals and accepts the floor", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "free",
				status: "active",
			});

			const tooFast = await service.isCheckIntervalAllowed(orgId, 60);
			expect(tooFast.allowed).toBe(false);
			expect(tooFast.limit).toBe(120);
			expect(tooFast.message).toMatch(/below 120 seconds/);

			const atFloor = await service.isCheckIntervalAllowed(orgId, 120);
			expect(atFloor.allowed).toBe(true);
			expect(atFloor.message).toBeUndefined();
		});
	});

	describe("getOrCreateSubscription", () => {
		test("creates a free-plan row on first call and returns it on the second", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			const first = await service.getOrCreateSubscription(orgId);
			expect(first.organizationId).toBe(orgId);
			expect(first.planId).toBe("free");
			expect(first.status).toBe("active");

			const rowsAfterFirst = await drizzleDb
				.select()
				.from(subscription)
				.where(eq(subscription.organizationId, orgId));
			expect(rowsAfterFirst).toHaveLength(1);

			const second = await service.getOrCreateSubscription(orgId);
			expect(second.id).toBe(first.id);

			const rowsAfterSecond = await drizzleDb
				.select()
				.from(subscription)
				.where(eq(subscription.organizationId, orgId));
			expect(rowsAfterSecond).toHaveLength(1);
		});
	});

	describe("syncFromPolar / downgradeToFree", () => {
		test("upgrades an existing subscription in place, then downgrades back to free", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			const initial = await service.getOrCreateSubscription(orgId);
			expect(initial.planId).toBe("free");

			const upgraded = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "active",
				polarCustomerId: "cus_test_123",
				polarSubscriptionId: "sub_test_456",
			});
			expect(upgraded.id).toBe(initial.id);
			expect(upgraded.planId).toBe("uppity");
			expect(upgraded.polarCustomerId).toBe("cus_test_123");
			expect(upgraded.polarSubscriptionId).toBe("sub_test_456");

			const downgraded = await service.downgradeToFree(orgId);
			expect(downgraded.id).toBe(initial.id);
			expect(downgraded.planId).toBe("free");
			expect(downgraded.status).toBe("active");
			// Polar identifiers are preserved so the customer can be reactivated
			// without re-linking — syncFromPolar falls back to existing values.
			expect(downgraded.polarCustomerId).toBe("cus_test_123");
		});

		test("stores the billing interval, keeps it when a sync omits it, and clears it on downgrade", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			const annual = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "active",
				billingInterval: "year",
			});
			expect(annual.billingInterval).toBe("year");

			// The cancel path sends no interval of its own on older payloads.
			const kept = await service.syncFromPolar(orgId, { planId: "uppity", status: "canceled" });
			expect(kept.billingInterval).toBe("year");

			const downgraded = await service.downgradeToFree(orgId);
			expect(downgraded.billingInterval).toBeNull();
		});

		test("creates a new row via syncFromPolar when none exists", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			const result = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "active",
				polarCustomerId: "cus_fresh",
			});
			expect(result.planId).toBe("uppity");
			expect(result.polarCustomerId).toBe("cus_fresh");

			const [row] = await drizzleDb
				.select()
				.from(subscription)
				.where(eq(subscription.organizationId, orgId));
			expect(row?.id).toBe(result.id);
		});
	});

	describe("resyncFromPolar", () => {
		test("overwrites local drift with the Polar snapshot", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);
			await service.syncFromPolar(orgId, { planId: "free", status: "active" });

			const updated = await service.resyncFromPolar(orgId, {
				planId: "uppity",
				status: "active",
				polarCustomerId: "cus_1",
				polarSubscriptionId: "sub_1",
				currentPeriodStart: new Date("2026-07-01T00:00:00Z"),
				currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
			});

			expect(updated.planId).toBe("uppity");
			expect(updated.polarSubscriptionId).toBe("sub_1");
		});

		test("leaves before-state observable for auditing", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);
			await service.syncFromPolar(orgId, { planId: "free", status: "active" });

			const before = await service.getSubscription(orgId);
			const after = await service.resyncFromPolar(orgId, { planId: "uppity", status: "past_due" });

			expect(before?.planId).toBe("free");
			expect(after.planId).toBe("uppity");
			expect(after.status).toBe("past_due");
		});
	});

	describe("getEffectiveLimits", () => {
		test("uppity plan unlocks sso, audit logs and unlimited status pages", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
			});

			const limits = await service.getEffectiveLimits(orgId);
			expect(limits.monitors).toBe(50);
			expect(limits.checkIntervalSeconds).toBe(30);
			expect(limits.statusPages).toBe(-1);
			expect(limits.sso).toBe(true);
			expect(limits.auditLogs).toBe(true);
			expect(limits.teamMembers).toBe(-1);
		});

		test("dedicated plan caps monitors at the 2000 fair-use figure rather than unlimited", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "dedicated",
				status: "active",
			});

			const limits = await service.getEffectiveLimits(orgId);
			expect(limits.monitors).toBe(2000);
			expect(limits.retentionDays).toBe(-1);
		});

		test("uppity's ceiling grows by 50 for every purchased capacity block", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
			});

			const limits = await service.getEffectiveLimits(orgId);
			expect(limits.monitors).toBe(200);
		});

		test("a subscription created without blocks defaults to the included 50", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
			});

			const stored = await service.getSubscription(orgId);
			expect(stored?.blocks).toBe(0);
			expect((await service.getEffectiveLimits(orgId)).monitors).toBe(50);
		});

		test("blocks on a free-plan row do not raise the free ceiling", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "free",
				status: "active",
				blocks: 4,
			});

			const limits = await service.getEffectiveLimits(orgId);
			expect(limits.monitors).toBe(20);
		});

		test("self-hosted stays unlimited regardless of stored blocks", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 4,
			});

			vi.stubEnv("SELF_HOSTED", "true");
			try {
				const limits = await service.getEffectiveLimits(orgId);
				expect(limits.monitors).toBe(-1);
			} finally {
				vi.stubEnv("SELF_HOSTED", "");
			}
		});

		test("an unknown plan id falls back to free limits", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "legacy-tier-that-no-longer-exists",
				status: "active",
			});

			const limits = await service.getEffectiveLimits(orgId);
			expect(limits.monitors).toBe(20);
		});
	});

	describe("getOrganizationPlan", () => {
		test("enterprise limits are identical to dedicated — the tier unlocks no features", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);

			const dedicatedOrg = await seedOrg(drizzleDb);
			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: dedicatedOrg,
				planId: "dedicated",
				status: "active",
			});

			const enterpriseOrg = await seedOrg(drizzleDb);
			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: enterpriseOrg,
				planId: "enterprise",
				status: "active",
			});

			const dedicated = await service.getOrganizationPlan(dedicatedOrg);
			const enterprise = await service.getOrganizationPlan(enterpriseOrg);

			expect(enterprise.limits).toEqual(dedicated.limits);
			// Pricing is where they differ: Enterprise is negotiated.
			expect(dedicated.monthlyPriceCents).toBe(29900);
			expect(enterprise.monthlyPriceCents).toBeNull();
		});
	});

	describe("getMemberCapacity", () => {
		test("counts accepted members plus unexpired pending invitations", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "free",
				status: "active",
			});

			for (let i = 0; i < 4; i++) await seedMember(drizzleDb, orgId);
			await seedInvitation(drizzleDb, orgId);

			const capacity = await service.getMemberCapacity(orgId);
			expect(capacity.used).toBe(5);
			expect(capacity.limit).toBe(5);
			expect(capacity.canInvite).toBe(false);
		});

		test("an expired invitation does not hold a slot", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "free",
				status: "active",
			});

			await seedMember(drizzleDb, orgId);
			await seedInvitation(drizzleDb, orgId, { expired: true });

			const capacity = await service.getMemberCapacity(orgId);
			expect(capacity.used).toBe(1);
			expect(capacity.canInvite).toBe(true);
		});

		test("uppity's unlimited members resolve to the operator's ceiling", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
			});

			const capacity = await service.getMemberCapacity(orgId);
			// -1 must not reach better-auth, whose check is `membersCount >= limit`.
			expect(capacity.limit).toBe(ORGANIZATION_MEMBERSHIP_LIMIT);
			expect(capacity.canInvite).toBe(true);
		});

		test("an organization already over its cap reports canInvite false without error", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "free",
				status: "active",
			});

			for (let i = 0; i < 8; i++) await seedMember(drizzleDb, orgId);

			const capacity = await service.getMemberCapacity(orgId);
			expect(capacity.used).toBe(8);
			expect(capacity.limit).toBe(5);
			expect(capacity.canInvite).toBe(false);
		});
	});

	describe("setBlocks", () => {
		test("raising the count persists it and widens the ceiling", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
			});

			const result = await service.setBlocks(orgId, 2);
			expect(result.ok).toBe(true);
			expect((await service.getSubscription(orgId))?.blocks).toBe(2);
			expect((await service.getEffectiveLimits(orgId)).monitors).toBe(150);
		});

		test("a reduction is scheduled and the ceiling holds until the period ends", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
				blocks: 4,
			});

			expect((await service.setBlocks(orgId, 1)).ok).toBe(true);

			const row = await service.getSubscription(orgId);
			expect(row?.blocks).toBe(4);
			expect(row?.scheduledBlocks).toBe(1);
			expect((await service.getEffectiveLimits(orgId)).monitors).toBe(250);
		});

		test("a reduction below current usage is scheduled, not refused", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
				blocks: 2,
			});
			await seedMonitors(drizzleDb, orgId, 68);

			expect((await service.setBlocks(orgId, 0)).ok).toBe(true);
			expect((await service.getSubscription(orgId))?.scheduledBlocks).toBe(0);
		});

		test("lowering a scheduled reduction further replaces it", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
				blocks: 4,
				scheduledBlocks: 2,
			});

			await service.setBlocks(orgId, 1);

			const row = await service.getSubscription(orgId);
			expect(row?.blocks).toBe(4);
			expect(row?.scheduledBlocks).toBe(1);
		});

		test("a reduction with no known period end applies immediately", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 4,
			});

			await service.setBlocks(orgId, 1);

			const row = await service.getSubscription(orgId);
			expect(row?.blocks).toBe(1);
			expect(row?.scheduledBlocks).toBeNull();
		});

		test("asking for the count already held cancels a scheduled reduction", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 4,
				scheduledBlocks: 2,
			});

			await service.setBlocks(orgId, 4);

			const row = await service.getSubscription(orgId);
			expect(row?.blocks).toBe(4);
			expect(row?.scheduledBlocks).toBeNull();
		});

		test("an increase applies immediately and drops a scheduled reduction", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 4,
				scheduledBlocks: 2,
			});

			await service.setBlocks(orgId, 5);

			const row = await service.getSubscription(orgId);
			expect(row?.blocks).toBe(5);
			expect(row?.scheduledBlocks).toBeNull();
		});

		test("a count above the maximum is refused, naming the maximum", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
			});

			expect((await service.setBlocks(orgId, 40)).ok).toBe(true);
			expect(await service.setBlocks(orgId, 41)).toStrictEqual({
				ok: false,
				reason: "above_max",
				max: 40,
			});
			expect((await service.getSubscription(orgId))?.blocks).toBe(40);
		});

		test("a plan that is not sold by capacity is refused", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "dedicated",
				status: "active",
			});

			expect(await service.setBlocks(orgId, 3)).toStrictEqual({
				ok: false,
				reason: "plan_ineligible",
			});
			expect((await service.getSubscription(orgId))?.blocks).toBe(0);
		});

		test("negative and fractional counts are refused before reaching the database", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
			});

			expect(await service.setBlocks(orgId, -1)).toStrictEqual({
				ok: false,
				reason: "invalid_count",
			});
			expect(await service.setBlocks(orgId, 1.5)).toStrictEqual({
				ok: false,
				reason: "invalid_count",
			});
			expect((await service.getSubscription(orgId))?.blocks).toBe(0);
		});
	});

	describe("multi-organization guard", () => {
		test("refuses an increase when the customer holds blocks in another organization", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const customer = `cus_${nanoid()}`;
			const holder = await seedSubscribed(drizzleDb, {
				polarCustomerId: customer,
				blocks: 2,
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
			});
			const orgId = await seedSubscribed(drizzleDb, {
				polarCustomerId: customer,
				blocks: 0,
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
			});

			expect(await service.setBlocks(orgId, 1)).toStrictEqual({
				ok: false,
				reason: "multi_org_customer",
				organization: { id: holder, name: `Test Org ${holder.slice("test-org-".length)}` },
			});
			expect((await service.getSubscription(orgId))?.blocks).toBe(0);
		});

		test("allows a reduction, which only shrinks a double charge", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const customer = `cus_${nanoid()}`;
			await seedSubscribed(drizzleDb, {
				polarCustomerId: customer,
				blocks: 2,
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
			});
			const orgId = await seedSubscribed(drizzleDb, {
				polarCustomerId: customer,
				blocks: 3,
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
			});

			expect((await service.setBlocks(orgId, 1)).ok).toBe(true);
		});

		test("allows an increase when the other organization holds no blocks", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const customer = `cus_${nanoid()}`;
			await seedSubscribed(drizzleDb, {
				polarCustomerId: customer,
				blocks: 0,
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
			});
			const orgId = await seedSubscribed(drizzleDb, {
				polarCustomerId: customer,
				blocks: 0,
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
			});

			expect((await service.setBlocks(orgId, 2)).ok).toBe(true);
		});
	});

	describe("webhook writes for a held subscription", () => {
		const renewal = { planId: "uppity", status: "past_due" } as const;

		test("apply for the subscription on record", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedSubscribed(drizzleDb, {
				blocks: 3,
				polarCustomerId: "cus_real",
				polarSubscriptionId: "sub_real",
			});
			const held = { polarSubscriptionId: "sub_real", polarCustomerId: "cus_real" };

			expect((await service.syncHeldFromPolar(orgId, held, renewal))?.status).toBe("past_due");
			expect((await service.downgradeHeldToFree(orgId, held))?.planId).toBe("free");
		});

		test("change nothing for any other subscription carrying the reference", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedSubscribed(drizzleDb, {
				blocks: 3,
				polarCustomerId: "cus_real",
				polarSubscriptionId: "sub_real",
			});

			// A stranger's subscription, and the same customer's superseded one.
			for (const held of [
				{ polarSubscriptionId: "sub_stray", polarCustomerId: "cus_stranger" },
				{ polarSubscriptionId: "sub_old", polarCustomerId: "cus_real" },
			]) {
				expect(await service.syncHeldFromPolar(orgId, held, renewal)).toBeNull();
				expect(await service.downgradeHeldToFree(orgId, held)).toBeNull();
			}

			const row = await service.getSubscription(orgId);
			expect(row?.planId).toBe("uppity");
			expect(row?.status).toBe("active");
			expect(row?.blocks).toBe(3);
		});

		test("fall back to the customer for rows without a stored subscription id", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedSubscribed(drizzleDb, {
				blocks: 3,
				polarCustomerId: "cus_real",
				polarSubscriptionId: null,
			});

			expect(
				await service.downgradeHeldToFree(orgId, {
					polarSubscriptionId: "sub_any",
					polarCustomerId: "cus_stranger",
				}),
			).toBeNull();
			expect(
				(
					await service.downgradeHeldToFree(orgId, {
						polarSubscriptionId: "sub_any",
						polarCustomerId: "cus_real",
					})
				)?.planId,
			).toBe("free");
		});

		test("never create a row for an organization without one", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);
			const held = { polarSubscriptionId: "sub_any", polarCustomerId: "cus_any" };

			expect(await service.syncHeldFromPolar(orgId, held, renewal)).toBeNull();
			expect(await service.getSubscription(orgId)).toBeNull();
		});
	});

	describe("canManageBilling", () => {
		test("owners and admins may, members and outsiders may not", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);
			const otherOrg = await seedOrg(drizzleDb);

			expect(
				await service.canManageBilling(orgId, await seedMember(drizzleDb, orgId, "owner")),
			).toBe(true);
			expect(
				await service.canManageBilling(orgId, await seedMember(drizzleDb, orgId, "admin")),
			).toBe(true);
			expect(
				await service.canManageBilling(orgId, await seedMember(drizzleDb, orgId, "member")),
			).toBe(false);
			expect(await service.memberRole(orgId, await seedMember(drizzleDb, orgId, "member"))).toBe(
				"member",
			);
			expect(await service.memberRole(orgId, await seedUser(drizzleDb))).toBeNull();
			// An owner elsewhere is an outsider here.
			expect(
				await service.canManageBilling(orgId, await seedMember(drizzleDb, otherOrg, "owner")),
			).toBe(false);
		});
	});

	describe("applyScheduledReductions", () => {
		const now = new Date("2026-03-12T00:00:00Z");

		test("applies a reduction whose period has ended and leaves the rest pending", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const ended = await seedSubscribed(drizzleDb, {
				blocks: 4,
				scheduledBlocks: 2,
				currentPeriodEnd: new Date("2026-03-11T00:00:00Z"),
			});
			const running = await seedSubscribed(drizzleDb, {
				blocks: 4,
				scheduledBlocks: 2,
				currentPeriodEnd: new Date("2026-03-13T00:00:00Z"),
			});

			await service.applyScheduledReductions(now);

			const endedRow = await service.getSubscription(ended);
			expect(endedRow?.blocks).toBe(2);
			expect(endedRow?.scheduledBlocks).toBeNull();

			const runningRow = await service.getSubscription(running);
			expect(runningRow?.blocks).toBe(4);
			expect(runningRow?.scheduledBlocks).toBe(2);
		});

		test("a second pass changes nothing", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedSubscribed(drizzleDb, {
				blocks: 4,
				scheduledBlocks: 2,
				currentPeriodEnd: new Date("2026-03-11T00:00:00Z"),
			});

			expect(await service.applyScheduledReductions(now)).toBeGreaterThanOrEqual(1);
			await service.applyScheduledReductions(now);

			const row = await service.getSubscription(orgId);
			expect(row?.blocks).toBe(2);
			expect(row?.scheduledBlocks).toBeNull();
		});

		test("applies even when usage outgrew the smaller ceiling, deleting nothing", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedSubscribed(drizzleDb, {
				blocks: 4,
				scheduledBlocks: 2,
				currentPeriodEnd: new Date("2026-03-11T00:00:00Z"),
			});
			await seedMonitors(drizzleDb, orgId, 160);

			await service.applyScheduledReductions(now);

			expect((await service.getSubscription(orgId))?.blocks).toBe(2);
			expect((await service.getUsage(orgId)).monitors).toBe(160);
			expect((await service.canAddMonitor(orgId)).allowed).toBe(false);
		});
	});

	describe("blocks across plan changes", () => {
		test("downgradeToFree clears the purchased capacity", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
			});

			const downgraded = await service.downgradeToFree(orgId);
			expect(downgraded.planId).toBe("free");
			expect(downgraded.blocks).toBe(0);
		});

		test("moving to a plan that does not sell blocks clears the count", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
			});

			// Kept, the count would re-arm billing the moment the plan became eligible
			// again — on a later switch back, or on resubscribe after a missed revoke —
			// charging for capacity nobody re-ordered.
			const upgraded = await service.syncFromPolar(orgId, {
				planId: "dedicated",
				status: "active",
			});
			expect(upgraded.blocks).toBe(0);
		});

		test("returning to an eligible plan does not resurrect a cleared count", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
			});

			await service.syncFromPolar(orgId, { planId: "dedicated", status: "active" });
			const returned = await service.syncFromPolar(orgId, { planId: "uppity", status: "active" });

			expect(returned.blocks).toBe(0);
			expect((await service.getEffectiveLimits(orgId)).monitors).toBe(50);
		});

		test("a renewal on the same eligible plan keeps the count", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
			});

			// Every `subscription.updated` webhook routes through here; only a change of
			// eligibility clears.
			const renewed = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "active",
				currentPeriodEnd: new Date(Date.now() + 86_400_000),
			});
			expect(renewed.blocks).toBe(3);
		});

		test("leaving block eligibility clears a scheduled reduction", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
				scheduledBlocks: 1,
			});

			const moved = await service.syncFromPolar(orgId, { planId: "dedicated", status: "active" });
			expect(moved.blocks).toBe(0);
			expect(moved.scheduledBlocks).toBeNull();
		});

		test("downgradeToFree clears a scheduled reduction", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
				scheduledBlocks: 1,
			});

			const downgraded = await service.downgradeToFree(orgId);
			expect(downgraded.blocks).toBe(0);
			expect(downgraded.scheduledBlocks).toBeNull();
		});

		test("the renewal webhook lands a scheduled reduction", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
				scheduledBlocks: 1,
				currentPeriodStart: new Date("2026-02-12T00:00:00Z"),
				currentPeriodEnd: new Date("2026-03-12T00:00:00Z"),
			});

			const renewed = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "active",
				currentPeriodStart: new Date("2026-03-12T00:00:00Z"),
				currentPeriodEnd: new Date("2026-04-12T00:00:00Z"),
			});
			expect(renewed.blocks).toBe(1);
			expect(renewed.scheduledBlocks).toBeNull();
		});

		test("a renewal starting just before the stored period end still lands", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
				scheduledBlocks: 1,
				currentPeriodStart: new Date("2026-02-12T00:00:00Z"),
				currentPeriodEnd: new Date("2026-03-12T00:00:00Z"),
			});

			const renewed = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "active",
				currentPeriodStart: new Date("2026-03-11T23:59:59Z"),
				currentPeriodEnd: new Date("2026-04-12T00:00:00Z"),
			});
			expect(renewed.blocks).toBe(1);
		});

		test("a renewal does not overwrite an increase made after the subscription was read", async ({
			db,
		}) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
				scheduledBlocks: 1,
				currentPeriodStart: new Date("2026-02-12T00:00:00Z"),
				currentPeriodEnd: new Date("2026-03-12T00:00:00Z"),
			});

			// The webhook reads the pending reduction, then the customer buys more before
			// it writes.
			const read = service.getSubscription.bind(service);
			vi.spyOn(service, "getSubscription").mockImplementationOnce(async (id) => {
				const stale = await read(id);
				await service.setBlocks(orgId, 5);
				return stale;
			});

			const renewed = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "active",
				currentPeriodStart: new Date("2026-03-12T00:00:00Z"),
				currentPeriodEnd: new Date("2026-04-12T00:00:00Z"),
			});
			expect(renewed.blocks).toBe(5);
			expect(renewed.scheduledBlocks).toBeNull();
		});

		test("a mid-period webhook leaves a scheduled reduction pending", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			const period = {
				currentPeriodStart: new Date("2026-02-12T00:00:00Z"),
				currentPeriodEnd: new Date("2026-03-12T00:00:00Z"),
			};
			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
				scheduledBlocks: 1,
				...period,
			});

			// A card update or a status flip re-sends the same period.
			const synced = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "past_due",
				...period,
			});
			expect(synced.blocks).toBe(3);
			expect(synced.scheduledBlocks).toBe(1);

			// The cancel webhook sends only the period end.
			const canceled = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "canceled",
				currentPeriodEnd: period.currentPeriodEnd,
			});
			expect(canceled.blocks).toBe(3);
			expect(canceled.scheduledBlocks).toBe(1);
		});

		test("a past_due sync leaves purchased capacity alone", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrg(drizzleDb);

			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: orgId,
				planId: "uppity",
				status: "active",
				blocks: 3,
			});

			const synced = await service.syncFromPolar(orgId, {
				planId: "uppity",
				status: "past_due",
			});
			expect(synced.status).toBe("past_due");
			expect(synced.blocks).toBe(3);
		});
	});
});
