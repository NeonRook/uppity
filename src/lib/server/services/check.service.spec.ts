import type { Monitor } from "$lib/server/db/schema";
// oxlint-disable-next-line no-unused-vars -- it is used below for mocks, false positive
import { tcpConnect } from "$lib/server/tcp";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

import { CheckService, type CheckResult } from "./check.service";

// Mock dependencies
vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
	},
}));

vi.mock("$lib/server/notifications", () => ({
	notificationService: {
		sendMonitorNotification: vi.fn(),
		sendSslExpiryWarning: vi.fn(),
	},
}));

vi.mock("$lib/server/services/incident.service", () => ({
	incidentService: {
		getActiveAutoIncidentForMonitor: vi.fn(),
		create: vi.fn(),
		autoResolveIncident: vi.fn(),
	},
}));

vi.mock("nanoid", () => ({
	nanoid: () => "test-id-123",
}));

vi.mock("$lib/server/tcp", () => ({
	tcpConnect: vi.fn(),
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

describe("CheckService", () => {
	let checkService: CheckService;
	let originalFetch: typeof global.fetch;
	beforeEach(() => {
		checkService = new CheckService();
		originalFetch = global.fetch;
		vi.clearAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe("HTTP monitors", () => {
		it("returns down when no URL configured", async () => {
			const monitor = createMockMonitor({ type: "http", url: null });

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("No URL configured");
		});

		it("returns up for 200 response when expecting 200", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				expectedStatusCodes: [200],
			});

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: vi.fn().mockResolvedValue("OK"),
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("up");
			expect(result.statusCode).toBe(200);
		});

		it("returns down for 500 response when expecting 200", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				expectedStatusCodes: [200],
			});

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockResolvedValue({
				status: 500,
				text: vi.fn().mockResolvedValue("Error"),
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.statusCode).toBe(500);
			expect(result.errorMessage).toBe("Unexpected status code: 500");
		});

		it("returns up for 201 when expecting [200, 201, 204]", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				expectedStatusCodes: [200, 201, 204],
			});

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockResolvedValue({
				status: 201,
				text: vi.fn().mockResolvedValue("Created"),
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("up");
			expect(result.statusCode).toBe(201);
		});

		it("returns down when expected body content not found", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				expectedBodyContains: "SUCCESS",
			});

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: vi.fn().mockResolvedValue("FAILURE"),
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("Expected body content not found");
		});

		it("returns up when expected body content is found", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				expectedBodyContains: "SUCCESS",
			});

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: vi.fn().mockResolvedValue("Response: SUCCESS!"),
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("up");
		});

		it("returns degraded for responses over 5 seconds", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
			});

			vi.useFakeTimers();

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockImplementation(async () => {
				await vi.advanceTimersByTimeAsync(5500);
				return { status: 200, text: vi.fn().mockResolvedValue("OK") };
			});

			const resultPromise = checkService.performCheck(monitor);
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(result.status).toBe("degraded");

			vi.useRealTimers();
		});

		it("returns down on network error", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
			});

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("Network error");
		});

		it("returns down with timeout message on abort", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				timeoutSeconds: 5,
			});

			const abortError = new Error("Aborted");
			abortError.name = "AbortError";
			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockRejectedValue(abortError);

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("Request timeout after 5s");
		});

		it("sends custom headers", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				headers: { Authorization: "Bearer token123" },
			});

			const fetchMock = vi.fn().mockResolvedValue({
				status: 200,
				text: vi.fn().mockResolvedValue("OK"),
			});
			//@ts-expect-error -- it's a mock
			global.fetch = fetchMock;

			await checkService.performCheck(monitor);

			expect(fetchMock).toHaveBeenCalledWith(
				"https://example.com",
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer token123",
					}),
				}),
			);
		});

		it("sends POST request with body", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				method: "POST",
				body: '{"test": true}',
			});

			const fetchMock = vi.fn().mockResolvedValue({
				status: 200,
				text: vi.fn().mockResolvedValue("OK"),
			});
			//@ts-expect-error -- it's a mock
			global.fetch = fetchMock;

			await checkService.performCheck(monitor);

			expect(fetchMock).toHaveBeenCalledWith(
				"https://example.com",
				expect.objectContaining({
					method: "POST",
					body: '{"test": true}',
				}),
			);
		});

		it("does not include body for GET requests", async () => {
			const monitor = createMockMonitor({
				type: "http",
				url: "https://example.com",
				method: "GET",
				body: "should be ignored",
			});

			const fetchMock = vi.fn().mockResolvedValue({
				status: 200,
				text: vi.fn().mockResolvedValue("OK"),
			});
			//@ts-expect-error -- it's a mock
			global.fetch = fetchMock;

			await checkService.performCheck(monitor);

			expect(fetchMock).toHaveBeenCalledWith(
				"https://example.com",
				expect.objectContaining({
					method: "GET",
					body: undefined,
				}),
			);
		});
	});

	describe("TCP monitors", () => {
		it("returns down when no hostname configured", async () => {
			const monitor = createMockMonitor({ type: "tcp", hostname: null, port: 80 });

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("No hostname or port configured");
		});

		it("returns down when no port configured", async () => {
			const monitor = createMockMonitor({ type: "tcp", hostname: "localhost", port: null });

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("No hostname or port configured");
		});

		it("returns up when connection succeeds", async () => {
			const monitor = createMockMonitor({
				type: "tcp",
				hostname: "localhost",
				port: 80,
			});

			(tcpConnect as Mock) = vi.fn().mockImplementation(async (options) => {
				const socket = { end: vi.fn() };
				setTimeout(() => options.socket.open(socket), 0);
				return socket;
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("up");
		});

		it("returns down on connection refused", async () => {
			const monitor = createMockMonitor({
				type: "tcp",
				hostname: "localhost",
				port: 80,
			});

			(tcpConnect as Mock) = vi.fn().mockImplementation(async (options) => {
				setTimeout(() => options.socket.connectError(null, new Error("Connection refused")), 0);
				return {};
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("Connection refused");
		});

		it("returns down on DNS resolution failure", async () => {
			const monitor = createMockMonitor({
				type: "tcp",
				hostname: "nonexistent.invalid",
				port: 80,
			});

			(tcpConnect as Mock) = vi.fn().mockRejectedValue(new Error("DNS resolution failed"));

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("DNS resolution failed");
		});
	});

	describe("Push monitors", () => {
		beforeEach(async () => {
			const { db } = await import("$lib/server/db");
			(db.select as Mock).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});
		});

		it("returns up for new monitor within grace period", async () => {
			const monitor = createMockMonitor({
				type: "push",
				intervalSeconds: 60,
				pushGracePeriodSeconds: 60,
				createdAt: new Date(),
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("up");
		});

		it("returns down when no heartbeat received after grace period", async () => {
			const monitor = createMockMonitor({
				type: "push",
				intervalSeconds: 60,
				pushGracePeriodSeconds: 60,
				createdAt: new Date(Date.now() - 200000),
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("No heartbeat received");
		});

		it("returns up when last heartbeat is recent", async () => {
			const { db } = await import("$lib/server/db");
			(db.select as Mock).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ checkedAt: new Date() }]),
						}),
					}),
				}),
			});

			const monitor = createMockMonitor({
				type: "push",
				intervalSeconds: 60,
				pushGracePeriodSeconds: 60,
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("up");
		});

		it("returns down when last heartbeat is overdue", async () => {
			const { db } = await import("$lib/server/db");
			(db.select as Mock).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ checkedAt: new Date(Date.now() - 300000) }]),
						}),
					}),
				}),
			});

			const monitor = createMockMonitor({
				type: "push",
				intervalSeconds: 60,
				pushGracePeriodSeconds: 60,
			});

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toContain("No heartbeat for");
		});
	});

	describe("unknown monitor type", () => {
		it("returns down with error message", async () => {
			const monitor = createMockMonitor({ type: "unknown" as never });

			const result = await checkService.performCheck(monitor);

			expect(result.status).toBe("down");
			expect(result.errorMessage).toBe("Unknown monitor type");
		});
	});

	describe("retry behavior", () => {
		it("returns first success without retrying", async () => {
			const monitor = createMockMonitor({ type: "http", retries: 3 });

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockResolvedValue({
				status: 200,
				text: vi.fn().mockResolvedValue("OK"),
			});

			const result = await checkService.performCheckWithRetries(monitor);

			expect(result.status).toBe("up");
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		it("retries failed checks up to limit", async () => {
			const monitor = createMockMonitor({ type: "http", retries: 2 });

			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockRejectedValue(new Error("Failed"));

			vi.useFakeTimers();
			const resultPromise = checkService.performCheckWithRetries(monitor);
			await vi.runAllTimersAsync();
			const result = await resultPromise;
			vi.useRealTimers();

			expect(result.status).toBe("down");
			expect(global.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
		});

		it("stops retrying after first success", async () => {
			const monitor = createMockMonitor({ type: "http", retries: 3 });

			//@ts-expect-error -- it's a mock
			global.fetch = vi
				.fn()
				.mockRejectedValueOnce(new Error("Failed"))
				.mockResolvedValueOnce({ status: 200, text: vi.fn().mockResolvedValue("OK") });

			vi.useFakeTimers();
			const resultPromise = checkService.performCheckWithRetries(monitor);
			await vi.runAllTimersAsync();
			const result = await resultPromise;
			vi.useRealTimers();

			expect(result.status).toBe("up");
			expect(global.fetch).toHaveBeenCalledTimes(2);
		});

		it("does not retry degraded status", async () => {
			const monitor = createMockMonitor({ type: "http", retries: 3 });

			vi.useFakeTimers();
			//@ts-expect-error -- it's a mock
			global.fetch = vi.fn().mockImplementation(async () => {
				await vi.advanceTimersByTimeAsync(5500);
				return { status: 200, text: vi.fn().mockResolvedValue("OK") };
			});

			const resultPromise = checkService.performCheckWithRetries(monitor);
			await vi.runAllTimersAsync();
			const result = await resultPromise;
			vi.useRealTimers();

			expect(result.status).toBe("degraded");
			expect(global.fetch).toHaveBeenCalledTimes(1);
		});
	});

	describe("saving check results", () => {
		beforeEach(async () => {
			const { db } = await import("$lib/server/db");

			(db.select as Mock).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([createMockMonitor()]),
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

		it("inserts check record", async () => {
			const { db } = await import("$lib/server/db");
			const result: CheckResult = { status: "up", statusCode: 200, responseTimeMs: 150 };

			await checkService.saveCheckResult("monitor-1", result);

			expect(db.insert).toHaveBeenCalled();
		});

		it("updates monitor status", async () => {
			const { db } = await import("$lib/server/db");
			const result: CheckResult = { status: "up", statusCode: 200, responseTimeMs: 150 };

			await checkService.saveCheckResult("monitor-1", result);

			expect(db.update).toHaveBeenCalled();
		});

		it("sends down notification when status changes from up to down", async () => {
			const { db } = await import("$lib/server/db");
			const { notificationService } = await import("$lib/server/notifications");
			const { incidentService } = await import("$lib/server/services/incident.service");

			let selectCallCount = 0;
			(db.select as Mock).mockImplementation(() => ({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockImplementation(() => {
							selectCallCount++;
							if (selectCallCount === 1) {
								return Promise.resolve([createMockMonitor({ alertAfterFailures: 1 })]);
							}
							return Promise.resolve([{ status: "up", consecutiveFailures: 0 }]);
						}),
					}),
				}),
			}));

			(incidentService.getActiveAutoIncidentForMonitor as Mock).mockResolvedValue(null);

			await checkService.saveCheckResult("monitor-1", {
				status: "down",
				responseTimeMs: 0,
				errorMessage: "Connection failed",
			});

			expect(notificationService.sendMonitorNotification).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				"monitor_down",
				"up",
				"Connection failed",
			);
		});

		it("sends up notification when status changes from down to up", async () => {
			const { db } = await import("$lib/server/db");
			const { notificationService } = await import("$lib/server/notifications");
			const { incidentService } = await import("$lib/server/services/incident.service");

			let selectCallCount = 0;
			(db.select as Mock).mockImplementation(() => ({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockImplementation(() => {
							selectCallCount++;
							if (selectCallCount === 1) {
								return Promise.resolve([createMockMonitor()]);
							}
							return Promise.resolve([{ status: "down", consecutiveFailures: 3 }]);
						}),
					}),
				}),
			}));

			(incidentService.getActiveAutoIncidentForMonitor as Mock).mockResolvedValue({ id: "inc-1" });

			await checkService.saveCheckResult("monitor-1", {
				status: "up",
				statusCode: 200,
				responseTimeMs: 100,
			});

			expect(notificationService.sendMonitorNotification).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				"monitor_up",
				"down",
			);
		});

		it("creates incident when monitor goes down", async () => {
			const { db } = await import("$lib/server/db");
			const { incidentService } = await import("$lib/server/services/incident.service");

			let selectCallCount = 0;
			(db.select as Mock).mockImplementation(() => ({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockImplementation(() => {
							selectCallCount++;
							if (selectCallCount === 1) {
								return Promise.resolve([createMockMonitor({ name: "API Server" })]);
							}
							return Promise.resolve([{ status: "up", consecutiveFailures: 0 }]);
						}),
					}),
				}),
			}));

			(incidentService.getActiveAutoIncidentForMonitor as Mock).mockResolvedValue(null);

			await checkService.saveCheckResult("monitor-1", {
				status: "down",
				responseTimeMs: 0,
				errorMessage: "Server error",
			});

			expect(incidentService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "API Server is down",
					isAutoCreated: true,
				}),
			);
		});

		it("resolves incident when monitor recovers", async () => {
			const { db } = await import("$lib/server/db");
			const { incidentService } = await import("$lib/server/services/incident.service");

			let selectCallCount = 0;
			(db.select as Mock).mockImplementation(() => ({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockImplementation(() => {
							selectCallCount++;
							if (selectCallCount === 1) {
								return Promise.resolve([createMockMonitor()]);
							}
							return Promise.resolve([{ status: "down", consecutiveFailures: 3 }]);
						}),
					}),
				}),
			}));

			(incidentService.getActiveAutoIncidentForMonitor as Mock).mockResolvedValue({ id: "inc-1" });

			await checkService.saveCheckResult("monitor-1", {
				status: "up",
				statusCode: 200,
				responseTimeMs: 100,
			});

			expect(incidentService.autoResolveIncident).toHaveBeenCalledWith("inc-1");
		});

		it("sends SSL expiry warning when certificate expires soon", async () => {
			const { db } = await import("$lib/server/db");
			const { notificationService } = await import("$lib/server/notifications");

			let selectCallCount = 0;
			(db.select as Mock).mockImplementation(() => ({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockImplementation(() => {
							selectCallCount++;
							if (selectCallCount === 1) {
								return Promise.resolve([
									createMockMonitor({ sslCheckEnabled: true, sslExpiryThresholdDays: 14 }),
								]);
							}
							return Promise.resolve([{ status: "up", consecutiveFailures: 0 }]);
						}),
					}),
				}),
			}));

			const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

			await checkService.saveCheckResult("monitor-1", {
				status: "up",
				statusCode: 200,
				responseTimeMs: 100,
				sslExpiresAt: expiryDate,
				sslIssuer: "Let's Encrypt",
			});

			expect(notificationService.sendSslExpiryWarning).toHaveBeenCalled();
		});

		it("does not send SSL warning when certificate has plenty of time", async () => {
			const { db } = await import("$lib/server/db");
			const { notificationService } = await import("$lib/server/notifications");

			let selectCallCount = 0;
			(db.select as Mock).mockImplementation(() => ({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockImplementation(() => {
							selectCallCount++;
							if (selectCallCount === 1) {
								return Promise.resolve([
									createMockMonitor({ sslCheckEnabled: true, sslExpiryThresholdDays: 14 }),
								]);
							}
							return Promise.resolve([{ status: "up", consecutiveFailures: 0 }]);
						}),
					}),
				}),
			}));

			const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

			await checkService.saveCheckResult("monitor-1", {
				status: "up",
				statusCode: 200,
				responseTimeMs: 100,
				sslExpiresAt: expiryDate,
			});

			expect(notificationService.sendSslExpiryWarning).not.toHaveBeenCalled();
		});
	});
});
