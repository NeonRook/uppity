import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import type { Monitor } from "../../lib/server/db/schema";
import { saveCheckResult } from "./check";

vi.mock("../shared/db", () => ({
	db: {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
	},
	client: {},
}));

vi.mock("nanoid", () => ({
	nanoid: () => "test-id-123",
}));

function createMockMonitor(overrides: Partial<Monitor> = {}): Monitor {
	return {
		id: "monitor-1",
		organizationId: "org-1",
		name: "Test Monitor",
		description: null,
		type: "http",
		url: "https://example.com",
		hostname: null,
		port: null,
		method: "GET",
		headers: null,
		body: null,
		expectedStatusCodes: [200],
		expectedBodyContains: null,
		intervalSeconds: 60,
		timeoutSeconds: 30,
		retries: 0,
		alertAfterFailures: 1,
		sslCheckEnabled: false,
		sslExpiryThresholdDays: 14,
		pushToken: null,
		pushGracePeriodSeconds: 60,
		active: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		nextCheckAt: null,
		checkRetryCount: 0,
		checkLastError: null,
		checkBackoffUntil: null,
		...overrides,
	};
}

describe("monitor worker saveCheckResult — outbox enqueue", () => {
	beforeEach(async () => {
		const { db } = await import("../shared/db");

		(db.select as Mock).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ status: "up", consecutiveFailures: 0 }]),
				}),
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		(db.insert as Mock).mockReturnValue({
			values: vi.fn().mockResolvedValue(undefined),
		});

		(db.update as Mock).mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});
	});

	it("enqueues monitor_down event when up → down at alert threshold", async () => {
		const { db } = await import("../shared/db");
		const monitor = createMockMonitor({ alertAfterFailures: 1 });

		// Track all values() arguments across all insert() calls
		const insertedValues: unknown[] = [];
		(db.insert as Mock).mockImplementation(() => ({
			values: vi.fn((v) => {
				insertedValues.push(v);
				return Promise.resolve(undefined);
			}),
		}));

		await saveCheckResult(
			monitor,
			{
				status: "down",
				responseTimeMs: 0,
				errorMessage: "Connection failed",
			},
			db as never,
		);

		const event = insertedValues.find(
			(v): v is { type: string; organizationId: string; payload: unknown } =>
				typeof v === "object" && v !== null && (v as { type?: string }).type === "monitor_down",
		);

		expect(event).toBeDefined();
		expect(event).toMatchObject({
			type: "monitor_down",
			organizationId: "org-1",
			monitorId: "monitor-1",
			status: "pending",
			payload: expect.objectContaining({
				previousStatus: "up",
				newStatus: "down",
				consecutiveFailures: 1,
				errorMessage: "Connection failed",
			}),
		});
	});

	it("enqueues monitor_up event when down → up", async () => {
		const { db } = await import("../shared/db");

		const insertedValues: unknown[] = [];
		(db.insert as Mock).mockImplementation(() => ({
			values: vi.fn((v) => {
				insertedValues.push(v);
				return Promise.resolve(undefined);
			}),
		}));

		(db.select as Mock).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ status: "down", consecutiveFailures: 5 }]),
				}),
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const monitor = createMockMonitor();
		await saveCheckResult(
			monitor,
			{
				status: "up",
				statusCode: 200,
				responseTimeMs: 100,
			},
			db as never,
		);

		const event = insertedValues.find(
			(v): v is { type: string; payload: unknown } =>
				typeof v === "object" && v !== null && (v as { type?: string }).type === "monitor_up",
		);

		expect(event).toBeDefined();
		expect(event).toMatchObject({
			type: "monitor_up",
			organizationId: "org-1",
			monitorId: "monitor-1",
			status: "pending",
			payload: expect.objectContaining({
				previousStatus: "down",
				newStatus: "up",
				consecutiveFailures: 0,
			}),
		});
	});

	it("enqueues monitor_degraded event when up → degraded", async () => {
		const { db } = await import("../shared/db");

		const insertedValues: unknown[] = [];
		(db.insert as Mock).mockImplementation(() => ({
			values: vi.fn((v) => {
				insertedValues.push(v);
				return Promise.resolve(undefined);
			}),
		}));

		(db.select as Mock).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ status: "up", consecutiveFailures: 0 }]),
				}),
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		await saveCheckResult(
			createMockMonitor(),
			{ status: "degraded", statusCode: 200, responseTimeMs: 6000 },
			db as never,
		);

		const event = insertedValues.find(
			(v): v is { type: string } =>
				typeof v === "object" && v !== null && (v as { type?: string }).type === "monitor_degraded",
		);
		expect(event).toBeDefined();
	});

	it("enqueues ssl_expiry_warning when cert within threshold", async () => {
		const { db } = await import("../shared/db");

		const insertedValues: unknown[] = [];
		(db.insert as Mock).mockImplementation(() => ({
			values: vi.fn((v) => {
				insertedValues.push(v);
				return Promise.resolve(undefined);
			}),
		}));

		(db.select as Mock).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ status: "up", consecutiveFailures: 0 }]),
				}),
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const sslExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		await saveCheckResult(
			createMockMonitor({ sslCheckEnabled: true, sslExpiryThresholdDays: 14 }),
			{
				status: "up",
				statusCode: 200,
				responseTimeMs: 100,
				sslExpiresAt,
				sslIssuer: "Let's Encrypt",
			},
			db as never,
		);

		const event = insertedValues.find(
			(v): v is { type: string; payload: unknown } =>
				typeof v === "object" &&
				v !== null &&
				(v as { type?: string }).type === "ssl_expiry_warning",
		);
		expect(event).toBeDefined();
		expect(event).toMatchObject({
			type: "ssl_expiry_warning",
			payload: expect.objectContaining({
				daysRemaining: expect.any(Number),
				sslIssuer: "Let's Encrypt",
			}),
		});
	});

	it("does NOT enqueue ssl_expiry_warning when cert has plenty of time", async () => {
		const { db } = await import("../shared/db");

		const insertedValues: unknown[] = [];
		(db.insert as Mock).mockImplementation(() => ({
			values: vi.fn((v) => {
				insertedValues.push(v);
				return Promise.resolve(undefined);
			}),
		}));

		(db.select as Mock).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ status: "up", consecutiveFailures: 0 }]),
				}),
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const sslExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		await saveCheckResult(
			createMockMonitor({ sslCheckEnabled: true, sslExpiryThresholdDays: 14 }),
			{ status: "up", statusCode: 200, responseTimeMs: 100, sslExpiresAt },
			db as never,
		);

		const event = insertedValues.find(
			(v): v is { type: string } =>
				typeof v === "object" &&
				v !== null &&
				(v as { type?: string }).type === "ssl_expiry_warning",
		);
		expect(event).toBeUndefined();
	});

	it("does NOT enqueue when transitioning from 'unknown'", async () => {
		const { db } = await import("../shared/db");

		const insertedValues: unknown[] = [];
		(db.insert as Mock).mockImplementation(() => ({
			values: vi.fn((v) => {
				insertedValues.push(v);
				return Promise.resolve(undefined);
			}),
		}));

		(db.select as Mock).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ status: "unknown", consecutiveFailures: 0 }]),
				}),
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		await saveCheckResult(
			createMockMonitor(),
			{ status: "down", responseTimeMs: 0, errorMessage: "down" },
			db as never,
		);

		const event = insertedValues.find(
			(v): v is { type: string } =>
				typeof v === "object" &&
				v !== null &&
				["monitor_down", "monitor_up", "monitor_degraded"].includes(
					(v as { type?: string }).type ?? "",
				),
		);
		expect(event).toBeUndefined();
	});

	it("does NOT enqueue when consecutiveFailures < alertAfterFailures", async () => {
		const { db } = await import("../shared/db");

		const insertedValues: unknown[] = [];
		(db.insert as Mock).mockImplementation(() => ({
			values: vi.fn((v) => {
				insertedValues.push(v);
				return Promise.resolve(undefined);
			}),
		}));

		(db.select as Mock).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ status: "up", consecutiveFailures: 0 }]),
				}),
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		await saveCheckResult(
			createMockMonitor({ alertAfterFailures: 3 }),
			{ status: "down", responseTimeMs: 0, errorMessage: "down" },
			db as never,
		);

		const event = insertedValues.find(
			(v): v is { type: string } =>
				typeof v === "object" && v !== null && (v as { type?: string }).type === "monitor_down",
		);
		expect(event).toBeUndefined();
	});
});
