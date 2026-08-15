import { ORGANIZATION_MEMBERSHIP_LIMIT } from "$lib/constants/auth";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";

import { invitation, member, organization, user } from "../db/auth-schema";
import { monitor, statusPage, subscription } from "../db/schema";
import { test } from "../test/fixture";
import type { TestDb } from "../test/harness";
import { SubscriptionService } from "./subscription.service";

async function seedOrganization(drizzleDb: TestDb["db"]): Promise<string> {
	const suffix = nanoid();
	const orgId = `test-org-${suffix}`;
	await drizzleDb.insert(organization).values({
		id: orgId,
		name: `Test Org ${suffix}`,
		slug: `test-org-${suffix}`,
		createdAt: new Date(),
	});
	return orgId;
}

async function seedUser(drizzleDb: TestDb["db"]): Promise<string> {
	const suffix = nanoid();
	const userId = `test-user-${suffix}`;
	await drizzleDb.insert(user).values({
		id: userId,
		name: `Test User ${suffix}`,
		email: `user-${suffix}@example.com`,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	return userId;
}

async function seedMember(drizzleDb: TestDb["db"], orgId: string): Promise<void> {
	await drizzleDb.insert(member).values({
		id: nanoid(),
		organizationId: orgId,
		userId: await seedUser(drizzleDb),
		role: "member",
		createdAt: new Date(),
	});
}

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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

		test("creates a new row via syncFromPolar when none exists", async ({ db }) => {
			const { db: drizzleDb } = db;
			const service = new SubscriptionService(drizzleDb);
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);
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
			const orgId = await seedOrganization(drizzleDb);
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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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

			const dedicatedOrg = await seedOrganization(drizzleDb);
			await drizzleDb.insert(subscription).values({
				id: nanoid(),
				organizationId: dedicatedOrg,
				planId: "dedicated",
				status: "active",
			});

			const enterpriseOrg = await seedOrganization(drizzleDb);
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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
			const orgId = await seedOrganization(drizzleDb);

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
});
