import { db } from "$lib/server/db";
import { monitor, type Monitor } from "$lib/server/db/schema";
import { checkService } from "$lib/server/services/check.service";
import { statsService } from "$lib/server/services/stats.service";
import { eq } from "drizzle-orm";
import cron, { type ScheduledTask } from "node-cron";

interface ScheduledJob {
	monitorId: string;
	task: ScheduledTask;
	intervalSeconds: number;
}

class Scheduler {
	private jobs: Map<string, ScheduledJob> = new Map();
	private maintenanceJobs: ScheduledTask[] = [];
	private isRunning = false;
	private checkQueue: string[] = [];
	private processing = false;

	async start(): Promise<void> {
		if (this.isRunning) {
			console.log("[Scheduler] Already running");
			return;
		}

		console.log("[Scheduler] Starting...");
		this.isRunning = true;

		// Load all active monitors and schedule them
		try {
			const monitors = await this.findActiveMonitors();
			console.log(`[Scheduler] Found ${monitors.length} active monitors`);

			for (const m of monitors) {
				this.scheduleMonitor(m);
			}

			// Schedule maintenance jobs
			this.scheduleMaintenanceJobs();

			// Process queue continuously
			void this.processQueue();
		} catch (error) {
			console.error("[Scheduler] Failed to start:", error);
		}
	}

	private async findActiveMonitors(): Promise<Monitor[]> {
		return db.select().from(monitor).where(eq(monitor.active, true));
	}

	private async findMonitorById(id: string): Promise<Monitor | null> {
		const [result] = await db.select().from(monitor).where(eq(monitor.id, id)).limit(1);
		return result || null;
	}

	private scheduleMaintenanceJobs(): void {
		// Daily stats aggregation - runs at 1:00 AM
		const dailyStatsJob = cron.schedule("0 1 * * *", async () => {
			console.log("[Scheduler] Running daily stats aggregation...");
			try {
				const count = await statsService.aggregateYesterday();
				console.log(`[Scheduler] Aggregated daily stats for ${count} monitors`);
			} catch (error) {
				console.error("[Scheduler] Failed to aggregate daily stats:", error);
			}
		});
		this.maintenanceJobs.push(dailyStatsJob);
		console.log("[Scheduler] Scheduled daily stats aggregation (1:00 AM)");

		// 24h rolling stats update - runs every 5 minutes
		const rollingStatsJob = cron.schedule("*/5 * * * *", async () => {
			try {
				await statsService.updateAll24hStats();
			} catch (error) {
				console.error("[Scheduler] Failed to update 24h stats:", error);
			}
		});
		this.maintenanceJobs.push(rollingStatsJob);
		console.log("[Scheduler] Scheduled 24h stats updates (every 5 min)");

		// Cleanup old checks - runs at 2:00 AM
		const cleanupJob = cron.schedule("0 2 * * *", async () => {
			console.log("[Scheduler] Running check data cleanup...");
			try {
				const deleted = await statsService.cleanupOldChecks(30);
				console.log(`[Scheduler] Deleted ${deleted} old check records`);
			} catch (error) {
				console.error("[Scheduler] Failed to cleanup old checks:", error);
			}
		});
		this.maintenanceJobs.push(cleanupJob);
		console.log("[Scheduler] Scheduled check cleanup (2:00 AM, keep 30 days)");
	}

	stop(): void {
		console.log("[Scheduler] Stopping...");
		this.isRunning = false;

		for (const [monitorId, job] of this.jobs) {
			void job.task.stop();
			console.log(`[Scheduler] Stopped job for monitor ${monitorId}`);
		}

		// Stop maintenance jobs
		for (const job of this.maintenanceJobs) {
			void job.stop();
		}
		this.maintenanceJobs = [];

		this.jobs.clear();
	}

	scheduleMonitor(m: Monitor): void {
		// Remove existing job if any
		this.unscheduleMonitor(m.id);

		if (!m.active) return;

		const intervalSeconds = m.intervalSeconds || 60;

		// Convert interval to cron expression
		// For intervals less than 60 seconds, we use a different approach
		let cronExpression: string;
		if (intervalSeconds < 60) {
			// Run every minute and handle sub-minute intervals in the callback
			cronExpression = "* * * * *";
		} else if (intervalSeconds < 3600) {
			// Run every N minutes
			const minutes = Math.floor(intervalSeconds / 60);
			cronExpression = `*/${minutes} * * * *`;
		} else {
			// Run every N hours
			const hours = Math.floor(intervalSeconds / 3600);
			cronExpression = `0 */${hours} * * *`;
		}

		const task = cron.schedule(cronExpression, () => {
			this.queueCheck(m.id);
		});

		this.jobs.set(m.id, {
			monitorId: m.id,
			task,
			intervalSeconds,
		});

		console.log(`[Scheduler] Scheduled monitor ${m.id} (${m.name}) every ${intervalSeconds}s`);

		// Run initial check immediately
		this.queueCheck(m.id);
	}

	unscheduleMonitor(monitorId: string): void {
		const job = this.jobs.get(monitorId);
		if (job) {
			void job.task.stop();
			this.jobs.delete(monitorId);
			console.log(`[Scheduler] Unscheduled monitor ${monitorId}`);
		}
	}

	private queueCheck(monitorId: string): void {
		if (!this.checkQueue.includes(monitorId)) {
			this.checkQueue.push(monitorId);
		}
	}

	private async processQueue(): Promise<void> {
		if (this.processing) return;

		this.processing = true;

		while (this.isRunning) {
			if (this.checkQueue.length === 0) {
				await new Promise((resolve) => setTimeout(resolve, 100));
				continue;
			}

			const monitorId = this.checkQueue.shift()!;
			await this.runCheck(monitorId);
		}

		this.processing = false;
	}

	private async runCheck(monitorId: string): Promise<void> {
		try {
			const m = await this.findMonitorById(monitorId);
			if (!m || !m.active) return;

			console.log(`[Scheduler] Running check for ${m.name}`);
			const result = await checkService.performCheckWithRetries(m);
			await checkService.saveCheckResult(monitorId, result);

			console.log(
				`[Scheduler] Check completed for ${m.name}: ${result.status} (${result.responseTimeMs}ms)`,
			);
		} catch (error) {
			console.error(`[Scheduler] Error checking monitor ${monitorId}:`, error);
		}
	}

	getJobCount(): number {
		return this.jobs.size;
	}

	isJobScheduled(monitorId: string): boolean {
		return this.jobs.has(monitorId);
	}
}

export const scheduler = new Scheduler();
