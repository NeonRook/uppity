import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

import type * as schema from "../lib/server/db/schema";

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
} from "../lib/constants/defaults";
import {
	monitorCheck,
	monitorStatus,
	incident,
	incidentMonitor,
	incidentUpdate,
	type Monitor,
} from "../lib/server/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

interface CheckResult {
	status: "up" | "down" | "degraded";
	statusCode?: number;
	responseTimeMs: number;
	errorMessage?: string;
	sslExpiresAt?: Date;
	sslIssuer?: string;
}

async function performHttpCheck(m: Monitor): Promise<CheckResult> {
	if (!m.url) {
		return { status: "down", responseTimeMs: 0, errorMessage: "No URL configured" };
	}

	const startTime = Date.now();
	const controller = new AbortController();
	const timeoutSeconds = m.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
	const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

	try {
		const headers: Record<string, string> = {
			"User-Agent": USER_AGENT,
			...m.headers,
		};

		const response = await fetch(m.url, {
			method: m.method || DEFAULT_HTTP_METHOD,
			headers,
			body: m.method !== "GET" && m.method !== "HEAD" ? m.body : undefined,
			signal: controller.signal,
		});

		clearTimeout(timeout);
		const responseTimeMs = Date.now() - startTime;

		const expectedCodes = m.expectedStatusCodes || [...DEFAULT_EXPECTED_STATUS_CODES];
		const statusOk = expectedCodes.includes(response.status);

		let bodyOk = true;
		if (m.expectedBodyContains && statusOk) {
			const body = await response.text();
			bodyOk = body.includes(m.expectedBodyContains);
		}

		let sslInfo: { sslExpiresAt?: Date; sslIssuer?: string } = {};
		if (m.sslCheckEnabled && m.url.startsWith("https://")) {
			sslInfo = await getSslInfo(m.url);
		}

		let status: "up" | "down" | "degraded" = "down";
		if (statusOk && bodyOk) {
			status = responseTimeMs > DEGRADED_RESPONSE_TIME_MS ? "degraded" : "up";
		}

		let errorMessage: string | undefined;
		if (statusOk) {
			if (!bodyOk) {
				errorMessage = "Expected body content not found";
			}
		} else {
			errorMessage = `Unexpected status code: ${response.status}`;
		}

		return { status, statusCode: response.status, responseTimeMs, errorMessage, ...sslInfo };
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

		return { status: "down", responseTimeMs, errorMessage };
	}
}

async function performTcpCheck(m: Monitor): Promise<CheckResult> {
	if (!m.hostname || !m.port) {
		return { status: "down", responseTimeMs: 0, errorMessage: "No hostname or port configured" };
	}

	const startTime = Date.now();
	const timeoutSeconds = m.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS;
	const timeoutMs = timeoutSeconds * 1000;

	return new Promise((resolve) => {
		let resolved = false;
		let socket: ReturnType<typeof Bun.connect> extends Promise<infer T> ? T : never;

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

		Bun.connect({
			hostname: m.hostname!,
			port: m.port!,
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

async function getSslInfo(url: string): Promise<{ sslExpiresAt?: Date; sslIssuer?: string }> {
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

			Bun.connect({
				hostname,
				port,
				tls: { rejectUnauthorized: false },
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

async function performPushCheck(m: Monitor, db: Db): Promise<CheckResult> {
	const gracePeriodSeconds = m.pushGracePeriodSeconds || DEFAULT_PUSH_GRACE_PERIOD_SECONDS;
	const expectedInterval = m.intervalSeconds || DEFAULT_INTERVAL_SECONDS;
	const totalAllowedSeconds = expectedInterval + gracePeriodSeconds;

	const [lastCheck] = await db
		.select()
		.from(monitorCheck)
		.where(eq(monitorCheck.monitorId, m.id))
		.orderBy(desc(monitorCheck.checkedAt))
		.limit(1);

	if (!lastCheck) {
		const monitorAge = Date.now() - new Date(m.createdAt).getTime();
		if (monitorAge < totalAllowedSeconds * 1000) {
			return { status: "up", responseTimeMs: 0 };
		}
		return { status: "down", responseTimeMs: 0, errorMessage: "No heartbeat received" };
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

async function performCheck(m: Monitor, db: Db): Promise<CheckResult> {
	switch (m.type) {
		case "http":
			return performHttpCheck(m);
		case "tcp":
			return performTcpCheck(m);
		case "push":
			return performPushCheck(m, db);
		default:
			return { status: "down", responseTimeMs: 0, errorMessage: "Unknown monitor type" };
	}
}

async function performCheckWithRetries(m: Monitor, db: Db): Promise<CheckResult> {
	const retries = m.retries ?? DEFAULT_RETRIES;
	let lastResult: CheckResult | null = null;

	for (let attempt = 0; attempt <= retries; attempt++) {
		lastResult = await performCheck(m, db);

		if (lastResult.status !== "down") {
			return lastResult;
		}

		if (attempt < retries) {
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
		}
	}

	return lastResult!;
}

async function saveCheckResult(m: Monitor, result: CheckResult, db: Db): Promise<void> {
	const checkId = nanoid();

	// Save the check result
	await db.insert(monitorCheck).values({
		id: checkId,
		monitorId: m.id,
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
		.where(eq(monitorStatus.monitorId, m.id))
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
		.where(eq(monitorStatus.monitorId, m.id));

	// Handle status change notifications and incidents
	if (statusChanged && previousStatus !== "unknown") {
		if (result.status === "down" && consecutiveFailures >= m.alertAfterFailures) {
			// Check for existing auto incident
			const [existingIncident] = await db
				.select({ id: incident.id })
				.from(incident)
				.innerJoin(incidentMonitor, eq(incident.id, incidentMonitor.incidentId))
				.where(eq(incidentMonitor.monitorId, m.id))
				.limit(1);

			if (!existingIncident) {
				// Create auto-incident
				const incidentId = nanoid();
				await db.insert(incident).values({
					id: incidentId,
					organizationId: m.organizationId,
					title: `${m.name} is down`,
					status: DEFAULT_INCIDENT_STATUS,
					impact: "major",
					isAutoCreated: true,
					startedAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				});

				await db.insert(incidentMonitor).values({
					incidentId,
					monitorId: m.id,
				});

				await db.insert(incidentUpdate).values({
					id: nanoid(),
					incidentId,
					status: DEFAULT_INCIDENT_STATUS,
					message: result.errorMessage || "Monitor is not responding.",
					createdAt: new Date(),
				});

				console.log(`[Worker] Created auto-incident ${incidentId} for monitor ${m.id}`);
			}
		} else if (result.status === "up" && previousStatus === "down") {
			// Auto-resolve any active incident for this monitor
			const [existingIncident] = await db
				.select({ id: incident.id })
				.from(incident)
				.innerJoin(incidentMonitor, eq(incident.id, incidentMonitor.incidentId))
				.where(eq(incidentMonitor.monitorId, m.id))
				.limit(1);

			if (existingIncident) {
				await db
					.update(incident)
					.set({
						status: "resolved",
						resolvedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(incident.id, existingIncident.id));

				await db.insert(incidentUpdate).values({
					id: nanoid(),
					incidentId: existingIncident.id,
					status: "resolved",
					message: "Monitor has recovered automatically.",
					createdAt: new Date(),
				});

				console.log(`[Worker] Auto-resolved incident ${existingIncident.id} for monitor ${m.id}`);
			}
		}
	}

	// Log SSL expiry warnings
	if (result.sslExpiresAt && m.sslCheckEnabled) {
		const daysUntilExpiry = Math.floor(
			(result.sslExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
		);
		const threshold = m.sslExpiryThresholdDays || DEFAULT_SSL_EXPIRY_THRESHOLD_DAYS;

		if (daysUntilExpiry <= threshold && daysUntilExpiry > 0) {
			console.warn(`[Worker] SSL certificate for ${m.name} expires in ${daysUntilExpiry} days`);
		}
	}
}

/**
 * Executes a monitor check with retries and saves the result.
 */
export async function executeCheck(m: Monitor, db: Db): Promise<void> {
	const result = await performCheckWithRetries(m, db);
	await saveCheckResult(m, result, db);
	const success = result.responseTimeMs ? ` in ${result.responseTimeMs}ms` : "";
	const error = result.errorMessage ? ` - ${result.errorMessage}` : "";
	console.log(`[Worker] Check ${m.id} (${m.name}): ${result.status}${success}${error}`);
}
