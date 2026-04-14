import {
	DEFAULT_TIMEOUT_SECONDS,
	DEFAULT_INTERVAL_SECONDS,
	DEFAULT_PUSH_GRACE_PERIOD_SECONDS,
	DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS,
	DEFAULT_HTTP_METHOD,
	DEFAULT_EXPECTED_STATUS_CODES,
	DEFAULT_HTTPS_PORT,
	DEFAULT_INCIDENT_STATUS,
	DEGRADED_RESPONSE_TIME_MS,
	SSL_INFO_TIMEOUT_MS,
	RETRY_DELAY_MS,
	USER_AGENT,
	DEFAULT_RETRIES,
} from "$lib/constants/defaults";
import { db } from "$lib/server/db";
import {
	monitorCheck,
	monitorStatus,
	monitor as monitorTable,
	type Monitor,
	type MonitorStatus,
} from "$lib/server/db/schema";
import { notificationService } from "$lib/server/notifications";
import { incidentService } from "$lib/server/services/incident.service";
import { tcpConnect, type TcpSocket } from "$lib/server/tcp";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export interface CheckResult {
	status: "up" | "down" | "degraded";
	statusCode?: number;
	responseTimeMs: number;
	errorMessage?: string;
	sslExpiresAt?: Date;
	sslIssuer?: string;
}

export class CheckService {
	async performCheck(monitor: Monitor): Promise<CheckResult> {
		switch (monitor.type) {
			case "http":
				return this.performHttpCheck(monitor);
			case "tcp":
				return this.performTcpCheck(monitor);
			case "push":
				return this.performPushCheck(monitor);
			default:
				return { status: "down", responseTimeMs: 0, errorMessage: "Unknown monitor type" };
		}
	}

	private async performHttpCheck(monitor: Monitor): Promise<CheckResult> {
		if (!monitor.url) {
			return { status: "down", responseTimeMs: 0, errorMessage: "No URL configured" };
		}

		const startTime = Date.now();
		const controller = new AbortController();
		const timeoutSeconds = monitor.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
		const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

		try {
			const headers: Record<string, string> = {
				"User-Agent": USER_AGENT,
				...monitor.headers,
			};

			const response = await fetch(monitor.url, {
				method: monitor.method || DEFAULT_HTTP_METHOD,
				headers,
				body: monitor.method !== "GET" && monitor.method !== "HEAD" ? monitor.body : undefined,
				signal: controller.signal,
			});

			clearTimeout(timeout);
			const responseTimeMs = Date.now() - startTime;

			// Check status code
			const expectedCodes = monitor.expectedStatusCodes || [...DEFAULT_EXPECTED_STATUS_CODES];
			const statusOk = expectedCodes.includes(response.status);

			// Check body content if configured
			let bodyOk = true;
			if (monitor.expectedBodyContains && statusOk) {
				const body = await response.text();
				bodyOk = body.includes(monitor.expectedBodyContains);
			}

			// Get SSL info for HTTPS URLs
			let sslInfo: { sslExpiresAt?: Date; sslIssuer?: string } = {};
			if (monitor.sslCheckEnabled && monitor.url.startsWith("https://")) {
				sslInfo = await this.getSslInfo(monitor.url);
			}

			// Determine status without nested ternary
			let status: "up" | "down" | "degraded" = "down";
			if (statusOk && bodyOk) {
				status = responseTimeMs > DEGRADED_RESPONSE_TIME_MS ? "degraded" : "up";
			}

			// Determine error message without negated conditions
			let errorMessage: string | undefined;
			if (statusOk) {
				if (!bodyOk) {
					errorMessage = "Expected body content not found";
				}
			} else {
				errorMessage = `Unexpected status code: ${response.status}`;
			}

			return {
				status,
				statusCode: response.status,
				responseTimeMs,
				errorMessage,
				...sslInfo,
			};
		} catch (error) {
			clearTimeout(timeout);
			const responseTimeMs = Date.now() - startTime;

			let errorMessage = "Unknown error";
			if (error instanceof Error) {
				if (error.name === "AbortError") {
					errorMessage = `Request timeout after ${timeoutSeconds}s`;
				} else {
					errorMessage = error.message;
				}
			}

			return {
				status: "down",
				responseTimeMs,
				errorMessage,
			};
		}
	}

	private async performTcpCheck(monitor: Monitor): Promise<CheckResult> {
		if (!monitor.hostname || !monitor.port) {
			return { status: "down", responseTimeMs: 0, errorMessage: "No hostname or port configured" };
		}

		const startTime = Date.now();
		const timeoutSeconds = monitor.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
		const timeoutMs = timeoutSeconds * 1000;

		return new Promise((resolve) => {
			let resolved = false;
			let socket: TcpSocket;

			const timer = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					socket?.end();
					resolve({
						status: "down",
						responseTimeMs: Date.now() - startTime,
						errorMessage: `Connection timeout after ${timeoutSeconds}s`,
					});
				}
			}, timeoutMs);

			tcpConnect({
				hostname: monitor.hostname!,
				port: monitor.port!,
				socket: {
					open(s) {
						socket = s;
						if (!resolved) {
							resolved = true;
							clearTimeout(timer);
							const responseTimeMs = Date.now() - startTime;
							s.end();
							resolve({
								status: responseTimeMs > DEGRADED_RESPONSE_TIME_MS ? "degraded" : "up",
								responseTimeMs,
							});
						}
					},
					data() {},
					close() {},
					error(_, err) {
						if (!resolved) {
							resolved = true;
							clearTimeout(timer);
							resolve({
								status: "down",
								responseTimeMs: Date.now() - startTime,
								errorMessage: err?.message || "Connection failed",
							});
						}
					},
					connectError(_, err) {
						if (!resolved) {
							resolved = true;
							clearTimeout(timer);
							resolve({
								status: "down",
								responseTimeMs: Date.now() - startTime,
								errorMessage: err?.message || "Connection failed",
							});
						}
					},
				},
			}).catch((err) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timer);
					resolve({
						status: "down",
						responseTimeMs: Date.now() - startTime,
						errorMessage: err?.message || "Connection failed",
					});
				}
			});
		});
	}

	private async getSslInfo(url: string): Promise<{ sslExpiresAt?: Date; sslIssuer?: string }> {
		try {
			const urlObj = new URL(url);
			const { hostname } = urlObj;
			const port = urlObj.port ? parseInt(urlObj.port, 10) : DEFAULT_HTTPS_PORT;

			return new Promise((resolve) => {
				let resolved = false;

				const timer = setTimeout(() => {
					if (!resolved) {
						resolved = true;
						resolve({});
					}
				}, SSL_INFO_TIMEOUT_MS);

				tcpConnect({
					hostname,
					port,
					tls: {
						rejectUnauthorized: false,
					},
					socket: {
						open(socket) {
							if (!resolved) {
								resolved = true;
								clearTimeout(timer);

								const cert = socket.getPeerCertificate();
								socket.end();

								if (cert && cert.valid_to) {
									resolve({
										sslExpiresAt: new Date(cert.valid_to),
										sslIssuer: cert.issuer?.O || cert.issuer?.CN,
									});
								} else {
									resolve({});
								}
							}
						},
						data() {},
						close() {},
						error() {
							if (!resolved) {
								resolved = true;
								clearTimeout(timer);
								resolve({});
							}
						},
						connectError() {
							if (!resolved) {
								resolved = true;
								clearTimeout(timer);
								resolve({});
							}
						},
					},
				}).catch(() => {
					if (!resolved) {
						resolved = true;
						clearTimeout(timer);
						resolve({});
					}
				});
			});
		} catch {
			return {};
		}
	}

	private async performPushCheck(monitor: Monitor): Promise<CheckResult> {
		// Push monitors check if we received a ping within the grace period
		const gracePeriodSeconds = monitor.pushGracePeriodSeconds || DEFAULT_PUSH_GRACE_PERIOD_SECONDS;
		const expectedInterval = monitor.intervalSeconds || DEFAULT_INTERVAL_SECONDS;
		const totalAllowedSeconds = expectedInterval + gracePeriodSeconds;

		// Get the last check for this monitor
		const [lastCheck] = await db
			.select()
			.from(monitorCheck)
			.where(eq(monitorCheck.monitorId, monitor.id))
			.orderBy(desc(monitorCheck.checkedAt))
			.limit(1);

		if (!lastCheck) {
			// No pings received yet - check if monitor was just created
			const monitorAge = Date.now() - new Date(monitor.createdAt).getTime();
			if (monitorAge < totalAllowedSeconds * 1000) {
				// Monitor is new, give it time
				return { status: "up", responseTimeMs: 0 };
			}
			return {
				status: "down",
				responseTimeMs: 0,
				errorMessage: "No heartbeat received",
			};
		}

		const lastPingAge = Date.now() - new Date(lastCheck.checkedAt).getTime();
		const isOverdue = lastPingAge > totalAllowedSeconds * 1000;

		if (isOverdue) {
			const overdueMinutes = Math.floor(lastPingAge / 60000);
			return {
				status: "down",
				responseTimeMs: 0,
				errorMessage: `No heartbeat for ${overdueMinutes} minutes`,
			};
		}

		return { status: "up", responseTimeMs: 0 };
	}

	async saveCheckResult(monitorId: string, result: CheckResult): Promise<void> {
		const checkId = nanoid();

		// Get the monitor for notifications
		const [monitor] = await db
			.select()
			.from(monitorTable)
			.where(eq(monitorTable.id, monitorId))
			.limit(1);

		// Save the check result
		await db.insert(monitorCheck).values({
			id: checkId,
			monitorId,
			status: result.status,
			statusCode: result.statusCode,
			responseTimeMs: result.responseTimeMs,
			errorMessage: result.errorMessage,
			sslExpiresAt: result.sslExpiresAt,
			sslIssuer: result.sslIssuer,
			checkedAt: new Date(),
		});

		// Update monitor status
		const [currentStatus] = await db
			.select()
			.from(monitorStatus)
			.where(eq(monitorStatus.monitorId, monitorId))
			.limit(1);

		const previousStatus = currentStatus?.status;
		const consecutiveFailures =
			result.status === "down" ? (currentStatus?.consecutiveFailures || 0) + 1 : 0;

		const statusChanged = previousStatus !== result.status;

		await db
			.update(monitorStatus)
			.set({
				status: result.status,
				lastCheckAt: new Date(),
				lastStatusChange: statusChanged ? new Date() : currentStatus?.lastStatusChange,
				consecutiveFailures,
				updatedAt: new Date(),
			})
			.where(eq(monitorStatus.monitorId, monitorId));

		// Send notifications if status changed
		if (monitor && statusChanged && previousStatus !== "unknown") {
			const updatedStatus: MonitorStatus = {
				monitorId,
				status: result.status,
				lastCheckAt: new Date(),
				lastStatusChange: new Date(),
				consecutiveFailures,
				uptimePercent24h: currentStatus?.uptimePercent24h ?? null,
				avgResponseTimeMs24h: currentStatus?.avgResponseTimeMs24h ?? null,
				updatedAt: new Date(),
			};

			// Determine notification type
			if (result.status === "down" && consecutiveFailures >= monitor.alertAfterFailures) {
				await notificationService.sendMonitorNotification(
					monitor,
					updatedStatus,
					"monitor_down",
					previousStatus,
					result.errorMessage,
				);

				// Auto-create incident if none exists
				const existingIncident = await incidentService.getActiveAutoIncidentForMonitor(monitorId);
				if (!existingIncident) {
					await incidentService.create({
						organizationId: monitor.organizationId,
						title: `${monitor.name} is down`,
						status: DEFAULT_INCIDENT_STATUS,
						impact: "major",
						message: result.errorMessage || "Monitor is not responding.",
						monitorIds: [monitorId],
						isAutoCreated: true,
					});
				}
			} else if (result.status === "up" && previousStatus === "down") {
				await notificationService.sendMonitorNotification(
					monitor,
					updatedStatus,
					"monitor_up",
					previousStatus,
				);

				// Auto-resolve any active incident for this monitor
				const existingIncident = await incidentService.getActiveAutoIncidentForMonitor(monitorId);
				if (existingIncident) {
					await incidentService.autoResolveIncident(existingIncident.id);
				}
			} else if (result.status === "degraded") {
				await notificationService.sendMonitorNotification(
					monitor,
					updatedStatus,
					"monitor_degraded",
					previousStatus,
				);
			}
		}

		// Check for SSL expiry warning
		if (monitor && result.sslExpiresAt && monitor.sslCheckEnabled) {
			const daysUntilExpiry = Math.floor(
				(result.sslExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
			);
			const threshold = monitor.sslExpiryThresholdDays || DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS;

			if (daysUntilExpiry <= threshold && daysUntilExpiry > 0) {
				const updatedStatus: MonitorStatus = {
					monitorId,
					status: result.status,
					lastCheckAt: new Date(),
					lastStatusChange: currentStatus?.lastStatusChange ?? null,
					consecutiveFailures,
					uptimePercent24h: currentStatus?.uptimePercent24h ?? null,
					avgResponseTimeMs24h: currentStatus?.avgResponseTimeMs24h ?? null,
					updatedAt: new Date(),
				};

				await notificationService.sendSslExpiryWarning(monitor, updatedStatus, daysUntilExpiry);
			}
		}
	}

	async performCheckWithRetries(monitor: Monitor): Promise<CheckResult> {
		const retries = monitor.retries ?? DEFAULT_RETRIES;
		let lastResult: CheckResult | null = null;

		for (let attempt = 0; attempt <= retries; attempt++) {
			lastResult = await this.performCheck(monitor);

			if (lastResult.status !== "down") {
				return lastResult;
			}

			// Wait a bit before retrying
			if (attempt < retries) {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
			}
		}

		return lastResult!;
	}
}

export const checkService = new CheckService();
