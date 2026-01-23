import { FREE_PLAN, PRO_PLAN, SELF_HOSTED_LIMITS } from "$lib/constants/plans";
import { db } from "$lib/server/db";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	SubscriptionService,
	isSelfHosted,
	getSelfHostedLimits,
	getPlanById,
} from "./subscription.service";

// Mock the database (vitest hoists vi.mock automatically)
vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
	},
}));

vi.mock("nanoid", () => ({
	nanoid: () => "test-sub-id",
}));

describe("subscription.service", () => {
	let service: SubscriptionService;
	const originalEnv = process.env.SELF_HOSTED;

	beforeEach(() => {
		service = new SubscriptionService();
		vi.clearAllMocks();
		// Reset SELF_HOSTED env
		delete process.env.SELF_HOSTED;
	});

	afterEach(() => {
		// Restore original env
		if (originalEnv === undefined) {
			delete process.env.SELF_HOSTED;
		} else {
			process.env.SELF_HOSTED = originalEnv;
		}
	});

	describe("isSelfHosted", () => {
		it("returns false when SELF_HOSTED is not set", () => {
			delete process.env.SELF_HOSTED;
			expect(isSelfHosted()).toBe(false);
		});

		it("returns false when SELF_HOSTED is not 'true'", () => {
			process.env.SELF_HOSTED = "false";
			expect(isSelfHosted()).toBe(false);

			process.env.SELF_HOSTED = "1";
			expect(isSelfHosted()).toBe(false);

			process.env.SELF_HOSTED = "yes";
			expect(isSelfHosted()).toBe(false);
		});

		it("returns true when SELF_HOSTED is 'true'", () => {
			process.env.SELF_HOSTED = "true";
			expect(isSelfHosted()).toBe(true);
		});
	});

	describe("getSelfHostedLimits", () => {
		it("returns unlimited limits", () => {
			const limits = getSelfHostedLimits();

			expect(limits.monitors).toBe(-1);
			expect(limits.statusPages).toBe(-1);
			expect(limits.retentionDays).toBe(-1);
			expect(limits.checkIntervalSeconds).toBe(30);
			expect(limits.customDomains).toBe(true);
			expect(limits.apiAccess).toBe("full");
			expect(limits.sso).toBe(true);
			expect(limits.auditLogs).toBe(true);
			expect(limits.notificationChannels).toContain("email");
			expect(limits.notificationChannels).toContain("slack");
			expect(limits.notificationChannels).toContain("discord");
			expect(limits.notificationChannels).toContain("webhook");
		});
	});

	describe("getPlanById", () => {
		it("returns free plan for 'free' id", () => {
			const plan = getPlanById("free");
			expect(plan).toEqual(FREE_PLAN);
		});

		it("returns pro plan for 'pro' id", () => {
			const plan = getPlanById("pro");
			expect(plan).toEqual(PRO_PLAN);
		});

		it("returns undefined for unknown plan id", () => {
			const plan = getPlanById("unknown" as "free");
			expect(plan).toBeUndefined();
		});
	});

	describe("getEffectiveLimits", () => {
		it("returns self-hosted limits when SELF_HOSTED=true", async () => {
			process.env.SELF_HOSTED = "true";

			const limits = await service.getEffectiveLimits("org-1");

			expect(limits).toEqual(SELF_HOSTED_LIMITS);
			// Database should not be called in self-hosted mode
			expect(db.select).not.toHaveBeenCalled();
		});

		it("returns plan limits from subscription when not self-hosted", async () => {
			const mockSubscription = {
				id: "sub-1",
				organizationId: "org-1",
				planId: "pro",
				status: "active",
			};

			const selectMock = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSubscription]),
					}),
				}),
			});
			vi.mocked(db.select).mockImplementation(selectMock);

			const limits = await service.getEffectiveLimits("org-1");

			expect(limits).toEqual(PRO_PLAN.limits);
		});
	});

	describe("canAddMonitor", () => {
		it("always allows in self-hosted mode", async () => {
			process.env.SELF_HOSTED = "true";

			const result = await service.canAddMonitor("org-1");

			expect(result.allowed).toBe(true);
		});

		it("allows when under limit", async () => {
			// Mock subscription lookup returning free plan
			const mockSubscription = {
				id: "sub-1",
				organizationId: "org-1",
				planId: "free",
				status: "active",
			};

			const mockSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([mockSubscription]),
			};

			const mockCountChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([{ count: 3 }]), // Under free plan limit of 5
			};

			let callCount = 0;
			vi.mocked(db.select).mockImplementation((() => {
				callCount++;
				// First call: get subscription, second/third: count monitors/status pages
				if (callCount === 1) {
					return mockSelectChain;
				}
				return mockCountChain;
			}) as unknown as typeof db.select);

			const result = await service.canAddMonitor("org-1");

			expect(result.allowed).toBe(true);
			expect(result.currentUsage).toBe(3);
			expect(result.limit).toBe(5);
		});

		it("blocks when at limit", async () => {
			const mockSubscription = {
				id: "sub-1",
				organizationId: "org-1",
				planId: "free",
				status: "active",
			};

			const mockSelectChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([mockSubscription]),
			};

			const mockCountChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([{ count: 5 }]), // At free plan limit of 5
			};

			let callCount = 0;
			vi.mocked(db.select).mockImplementation((() => {
				callCount++;
				if (callCount === 1) {
					return mockSelectChain;
				}
				return mockCountChain;
			}) as unknown as typeof db.select);

			const result = await service.canAddMonitor("org-1");

			expect(result.allowed).toBe(false);
			expect(result.currentUsage).toBe(5);
			expect(result.limit).toBe(5);
			expect(result.message).toContain("limit of 5 monitors");
		});
	});

	describe("isCheckIntervalAllowed", () => {
		it("allows any interval in self-hosted mode", async () => {
			process.env.SELF_HOSTED = "true";

			const result = await service.isCheckIntervalAllowed("org-1", 30);

			expect(result.allowed).toBe(true);
		});

		it("blocks intervals below plan minimum", async () => {
			const mockSubscription = {
				id: "sub-1",
				organizationId: "org-1",
				planId: "free", // Free plan minimum is 300 seconds (5 min)
				status: "active",
			};

			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSubscription]),
					}),
				}),
			} as unknown as ReturnType<typeof db.select>);

			const result = await service.isCheckIntervalAllowed("org-1", 60); // 1 minute

			expect(result.allowed).toBe(false);
			expect(result.limit).toBe(300);
			expect(result.message).toContain("300 seconds");
		});

		it("allows intervals at or above plan minimum", async () => {
			const mockSubscription = {
				id: "sub-1",
				organizationId: "org-1",
				planId: "pro", // Pro plan minimum is 60 seconds (1 min)
				status: "active",
			};

			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSubscription]),
					}),
				}),
			} as unknown as ReturnType<typeof db.select>);

			const result = await service.isCheckIntervalAllowed("org-1", 60);

			expect(result.allowed).toBe(true);
		});
	});

	describe("isNotificationChannelAllowed", () => {
		it("allows all channels in self-hosted mode", async () => {
			process.env.SELF_HOSTED = "true";

			const emailResult = await service.isNotificationChannelAllowed("org-1", "email");
			const slackResult = await service.isNotificationChannelAllowed("org-1", "slack");
			const discordResult = await service.isNotificationChannelAllowed("org-1", "discord");
			const webhookResult = await service.isNotificationChannelAllowed("org-1", "webhook");

			expect(emailResult.allowed).toBe(true);
			expect(slackResult.allowed).toBe(true);
			expect(discordResult.allowed).toBe(true);
			expect(webhookResult.allowed).toBe(true);
		});

		it("blocks non-email channels on free plan", async () => {
			const mockSubscription = {
				id: "sub-1",
				organizationId: "org-1",
				planId: "free",
				status: "active",
			};

			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSubscription]),
					}),
				}),
			} as unknown as ReturnType<typeof db.select>);

			const slackResult = await service.isNotificationChannelAllowed("org-1", "slack");

			expect(slackResult.allowed).toBe(false);
			expect(slackResult.message).toContain("slack");
		});
	});
});
