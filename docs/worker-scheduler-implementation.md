# Worker Scheduler Implementation Plan

**Based on:** RFC-001 Option E (Database Polling with Distributed Locking)
**Status:** Not Started **Created:** 2026-01-20

---

## Overview

This document details the implementation of a standalone Bun worker process that
replaces the in-process cron-based scheduler. The worker uses PostgreSQL's
`FOR UPDATE SKIP LOCKED` for distributed coordination, enabling horizontal
scaling without duplicate checks.

### Goals

1. Decouple background job processing from the SvelteKit web server
2. Enable horizontal scaling of workers
3. Improve fault isolation between web and worker processes
4. Maintain precise check scheduling via `next_check_at` column

---

## Stage 1: Database Schema Changes

**Goal:** Add columns and indexes to support polling-based scheduling
**Status:** Not Started

### 1.1 Schema Update (`src/lib/server/db/schema.ts`)

Add new columns to the `monitor` table and define a partial index for efficient
polling:

```typescript
import { index, pgTable /* ... */ } from "drizzle-orm/pg-core";

export const monitor = pgTable(
	"monitor",
	{
		// ... existing columns ...

		// Scheduler columns
		nextCheckAt: timestamp("next_check_at", { withTimezone: true }).default(sql`NOW()`),
		checkRetryCount: integer("check_retry_count").default(0),
		checkLastError: text("check_last_error"),
		checkBackoffUntil: timestamp("check_backoff_until", { withTimezone: true }),

		// ... rest of table ...
	},
	(table) => [
		// ... existing indexes ...

		// Partial index for worker polling queries
		index("idx_monitor_due_checks")
			.on(table.nextCheckAt)
			.where(sql`${table.active} = true`),
	],
);
```

### 1.2 Add Minimum Interval Validation

Update `src/lib/schemas/monitor.ts` to enforce the 30-second minimum:

```typescript
import { MONITOR_INTERVAL } from "$lib/constants/defaults";

export const monitorSchema = z.object({
	// ... existing fields ...
	intervalSeconds: z
		.number()
		.int()
		.min(
			MONITOR_INTERVAL.MIN_SECONDS,
			`Minimum interval is ${MONITOR_INTERVAL.MIN_SECONDS} seconds`,
		)
		.max(
			MONITOR_INTERVAL.MAX_SECONDS,
			`Maximum interval is ${MONITOR_INTERVAL.MAX_SECONDS} seconds`,
		)
		.default(MONITOR_INTERVAL.DEFAULT_SECONDS),
});
```

### 1.3 Add Constants (`src/lib/constants/defaults.ts`)

```typescript
// Monitor interval constraints
export const MONITOR_INTERVAL = {
	MIN_SECONDS: envInt("UPPITY_MIN_INTERVAL_SECONDS", 30),
	MAX_SECONDS: envInt("UPPITY_MAX_INTERVAL_SECONDS", 86400), // 24 hours
	DEFAULT_SECONDS: envInt("UPPITY_DEFAULT_INTERVAL_SECONDS", 60),
} as const;
```

### 1.4 Migration Workflow

Drizzle handles migration generation from schema changes:

```bash
# Development: push schema changes directly
bun run db:push

# Generate migration files (if needed for review)
bunx drizzle-kit generate

# Production: Railway preDeploy hook runs migrations automatically
```

**Note:** Existing monitors will have `next_check_at` set to `NOW()` by the
default. The worker will pick them up on first poll.

### Success Criteria

- [ ] Schema changes applied via `bun run db:push`
- [ ] Existing monitors have `next_check_at` populated (via default)
- [ ] Partial index created and used by query planner (`EXPLAIN ANALYZE`)
- [ ] Schema validation rejects intervals < 30 seconds

---

## Stage 2: Worker Constants and Configuration

**Goal:** Define worker-specific configuration **Status:** Not Started

### 2.1 Create Worker Constants (`src/lib/constants/worker.ts`)

```typescript
import { envInt } from "$lib/utils";

// Polling configuration
export const WORKER_POLL_BATCH_SIZE = envInt("UPPITY_WORKER_BATCH_SIZE", 10);
export const WORKER_POLL_INTERVAL_MS = envInt("UPPITY_WORKER_POLL_INTERVAL_MS", 1000);

// Exponential backoff for empty polls
export const WORKER_BACKOFF = {
	INITIAL_MS: envInt("UPPITY_WORKER_BACKOFF_INITIAL_MS", 100),
	MAX_MS: envInt("UPPITY_WORKER_BACKOFF_MAX_MS", 5000),
	MULTIPLIER: 2,
} as const;

// Check retry configuration
export const CHECK_RETRY = {
	MAX_ATTEMPTS: envInt("UPPITY_CHECK_MAX_RETRIES", 3),
	INITIAL_BACKOFF_MS: envInt("UPPITY_CHECK_BACKOFF_INITIAL_MS", 5000),
	MAX_BACKOFF_MS: envInt("UPPITY_CHECK_BACKOFF_MAX_MS", 300000), // 5 minutes
	MULTIPLIER: 2,
} as const;

// Dead letter threshold - monitors stuck in retry too long
export const DEAD_LETTER_THRESHOLD_HOURS = envInt("UPPITY_DEAD_LETTER_HOURS", 24);
```

### Success Criteria

- [ ] Constants file created with sensible defaults
- [ ] Environment variables documented in `.env.example`

---

## Stage 3: Core Polling Logic

**Goal:** Implement atomic claim-and-execute pattern with batching **Status:**
Not Started

### 3.1 Create Worker Entry Point (`src/worker/index.ts`)

```typescript
import { db } from "$lib/server/db";
import { monitor } from "$lib/server/db/schema";
import { checkService } from "$lib/server/services/check.service";
import { sql, and, eq, lte, or, isNull } from "drizzle-orm";
import { WORKER_POLL_BATCH_SIZE, WORKER_BACKOFF, CHECK_RETRY } from "$lib/constants/worker";

let running = true;
let currentBackoffMs = WORKER_BACKOFF.INITIAL_MS;

/**
 * Claims up to BATCH_SIZE monitors that are due for checking.
 * Uses SKIP LOCKED to allow multiple workers without conflicts.
 */
async function claimDueMonitors() {
	const now = new Date();

	// Atomic claim: SELECT + UPDATE in single transaction
	const claimed = await db.transaction(async (tx) => {
		// Find monitors due for check, not in backoff
		const dueMonitors = await tx.execute(sql`
      SELECT id FROM monitor
      WHERE active = true
        AND next_check_at <= ${now}
        AND (check_backoff_until IS NULL OR check_backoff_until <= ${now})
      ORDER BY next_check_at ASC
      LIMIT ${WORKER_POLL_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `);

		if (dueMonitors.rows.length === 0) {
			return [];
		}

		const monitorIds = dueMonitors.rows.map((r) => r.id as string);

		// Update next_check_at to prevent re-claiming
		// Actual next time will be set after check completes
		await tx
			.update(monitor)
			.set({
				nextCheckAt: sql`NOW() + INTERVAL '1 hour'`, // Temporary lock
			})
			.where(sql`id = ANY(${monitorIds})`);

		// Fetch full monitor data
		return tx
			.select()
			.from(monitor)
			.where(sql`id = ANY(${monitorIds})`);
	});

	return claimed;
}

/**
 * Executes a check and updates scheduling state.
 */
async function executeCheck(m: typeof monitor.$inferSelect) {
	try {
		const result = await checkService.performCheckWithRetries(m);
		await checkService.saveCheckResult(m.id, result);

		// Success: reset retry state, schedule next check
		await db
			.update(monitor)
			.set({
				nextCheckAt: sql`NOW() + INTERVAL '1 second' * ${m.intervalSeconds}`,
				checkRetryCount: 0,
				checkLastError: null,
				checkBackoffUntil: null,
			})
			.where(eq(monitor.id, m.id));
	} catch (error) {
		await handleCheckFailure(m, error);
	}
}

/**
 * Handles check failures with exponential backoff.
 */
async function handleCheckFailure(m: typeof monitor.$inferSelect, error: unknown) {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const newRetryCount = (m.checkRetryCount ?? 0) + 1;

	if (newRetryCount >= CHECK_RETRY.MAX_ATTEMPTS) {
		// Max retries exceeded - mark as dead letter
		console.error(`[Worker] Monitor ${m.id} exceeded max retries, entering dead letter state`);

		await db
			.update(monitor)
			.set({
				checkRetryCount: newRetryCount,
				checkLastError: `Dead letter: ${errorMessage}`,
				// Set far-future backoff - requires manual intervention
				checkBackoffUntil: sql`NOW() + INTERVAL '${DEAD_LETTER_THRESHOLD_HOURS} hours'`,
				nextCheckAt: sql`NOW() + INTERVAL '${DEAD_LETTER_THRESHOLD_HOURS} hours'`,
			})
			.where(eq(monitor.id, m.id));

		// TODO: Send alert to admin about dead letter monitor
		return;
	}

	// Calculate exponential backoff
	const backoffMs = Math.min(
		CHECK_RETRY.INITIAL_BACKOFF_MS * Math.pow(CHECK_RETRY.MULTIPLIER, newRetryCount - 1),
		CHECK_RETRY.MAX_BACKOFF_MS,
	);

	console.warn(
		`[Worker] Monitor ${m.id} check failed (attempt ${newRetryCount}/${CHECK_RETRY.MAX_ATTEMPTS}), ` +
			`backing off ${backoffMs}ms: ${errorMessage}`,
	);

	await db
		.update(monitor)
		.set({
			checkRetryCount: newRetryCount,
			checkLastError: errorMessage,
			checkBackoffUntil: sql`NOW() + INTERVAL '1 millisecond' * ${backoffMs}`,
			nextCheckAt: sql`NOW() + INTERVAL '1 millisecond' * ${backoffMs}`,
		})
		.where(eq(monitor.id, m.id));
}

/**
 * Main polling loop with adaptive backoff.
 */
async function pollLoop() {
	while (running) {
		try {
			const monitors = await claimDueMonitors();

			if (monitors.length > 0) {
				// Reset backoff on successful claim
				currentBackoffMs = WORKER_BACKOFF.INITIAL_MS;

				// Process batch concurrently
				await Promise.all(monitors.map(executeCheck));

				// Continue immediately - there may be more work
				continue;
			}

			// No work found - apply exponential backoff
			await sleep(currentBackoffMs);
			currentBackoffMs = Math.min(
				currentBackoffMs * WORKER_BACKOFF.MULTIPLIER,
				WORKER_BACKOFF.MAX_MS,
			);
		} catch (error) {
			console.error("[Worker] Poll loop error:", error);
			await sleep(WORKER_BACKOFF.MAX_MS);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Graceful shutdown
process.on("SIGTERM", () => {
	console.log("[Worker] Received SIGTERM, shutting down...");
	running = false;
});

process.on("SIGINT", () => {
	console.log("[Worker] Received SIGINT, shutting down...");
	running = false;
});

// Start worker
console.log("[Worker] Starting monitor scheduler worker...");
console.log(`[Worker] Batch size: ${WORKER_POLL_BATCH_SIZE}`);
console.log(`[Worker] Poll interval: ${WORKER_BACKOFF.INITIAL_MS}ms - ${WORKER_BACKOFF.MAX_MS}ms`);
pollLoop();
```

### 3.2 Build Configuration

Add worker build target to `package.json`:

```json
{
	"scripts": {
		"build": "vite build",
		"build:worker": "bun build src/worker/index.ts --outdir=build --target=bun",
		"build:all": "bun run build && bun run build:worker",
		"worker": "bun run src/worker/index.ts",
		"worker:prod": "bun run build/worker.js"
	}
}
```

### Success Criteria

- [ ] Worker starts and connects to database
- [ ] Claims monitors in batches of 10
- [ ] Processes checks concurrently within batch
- [ ] Backs off exponentially when no work available
- [ ] Handles SIGTERM/SIGINT gracefully

---

## Stage 4: Retry and Dead Letter Handling

**Goal:** Implement robust failure handling with visibility **Status:** Not
Started

### 4.1 Retry Strategy

The worker implements a three-tier retry strategy:

| Tier               | Scope                                           | Behavior                                                |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------- |
| **Check-level**    | Within `checkService.performCheckWithRetries()` | Immediate retries (1s delay) for transient failures     |
| **Schedule-level** | Worker's `handleCheckFailure()`                 | Exponential backoff (5s → 5min) for persistent failures |
| **Dead letter**    | After `MAX_ATTEMPTS` schedule retries           | Monitor frozen, requires manual intervention            |

### 4.2 Failure Scenarios

| Scenario            | Check-level     | Schedule-level | Result                 |
| ------------------- | --------------- | -------------- | ---------------------- |
| Timeout (transient) | Retries N times | -              | Success or Down        |
| DNS failure         | Retries N times | Backs off      | Eventually dead letter |
| Exception in code   | -               | Backs off      | Eventually dead letter |
| Database error      | -               | Backs off      | Eventually dead letter |

### 4.3 Dead Letter Recovery

Monitors enter dead letter state when:

- Schedule-level retries exhausted (default: 3 attempts)
- `check_backoff_until` set to 24 hours in the future

Recovery options:

1. **Manual reset via API:**

```typescript
// POST /api/monitors/[id]/reset-dead-letter
export async function POST({ params }) {
	await db
		.update(monitor)
		.set({
			checkRetryCount: 0,
			checkLastError: null,
			checkBackoffUntil: null,
			nextCheckAt: sql`NOW()`,
		})
		.where(eq(monitor.id, params.id));

	return json({ success: true });
}
```

2. **Automatic recovery job** (future enhancement):
   - Runs daily
   - Resets monitors in dead letter for > 24h
   - Sends summary notification

### 4.4 Monitoring Dead Letters

Add query for admin dashboard:

```typescript
// src/lib/server/services/monitor.service.ts
export async function getDeadLetterMonitors(organizationId: string) {
	return db
		.select()
		.from(monitor)
		.where(
			and(
				eq(monitor.organizationId, organizationId),
				gte(monitor.checkRetryCount, CHECK_RETRY.MAX_ATTEMPTS),
			),
		);
}
```

### Success Criteria

- [ ] Failed checks trigger exponential backoff
- [ ] Dead letter state is reached after max retries
- [ ] Dead letter monitors visible in dashboard
- [ ] Manual reset endpoint works
- [ ] Error messages preserved in `check_last_error`

---

## Stage 5: Maintenance Jobs Migration

**Goal:** Move maintenance jobs from in-process scheduler to worker **Status:**
Not Started

### 5.1 Add Maintenance Job Table (`src/lib/server/db/schema.ts`)

```typescript
export const maintenanceJob = pgTable("maintenance_job", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	cronExpression: text("cron_expression").notNull(),
	nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
	lastRunAt: timestamp("last_run_at", { withTimezone: true }),
	lastError: text("last_error"),
	enabled: boolean("enabled").default(true),
});
```

After pushing schema changes, seed the initial jobs:

```typescript
// src/lib/server/db/seed.ts (or run once via script)
await db
	.insert(maintenanceJob)
	.values([
		{
			id: "daily-stats",
			name: "Daily Stats Aggregation",
			cronExpression: "0 1 * * *",
			nextRunAt: new Date(),
		},
		{
			id: "rolling-stats",
			name: "Rolling Stats Update",
			cronExpression: "*/5 * * * *",
			nextRunAt: new Date(),
		},
		{
			id: "cleanup",
			name: "Old Check Cleanup",
			cronExpression: "0 2 * * *",
			nextRunAt: new Date(),
		},
	])
	.onConflictDoNothing();
```

### 5.2 Maintenance Job Runner

```typescript
// src/worker/maintenance.ts
import { db } from "$lib/server/db";
import { maintenanceJob } from "$lib/server/db/schema";
import { statsService } from "$lib/server/services/stats.service";
import { eq, lte, sql } from "drizzle-orm";
import cronParser from "cron-parser";

const jobHandlers: Record<string, () => Promise<void>> = {
	"daily-stats": async () => {
		await statsService.aggregateDailyStats();
	},
	"rolling-stats": async () => {
		await statsService.updateRollingStats();
	},
	cleanup: async () => {
		await statsService.cleanupOldChecks();
	},
};

export async function runDueMaintenanceJobs() {
	const now = new Date();

	const dueJobs = await db
		.select()
		.from(maintenanceJob)
		.where(and(eq(maintenanceJob.enabled, true), lte(maintenanceJob.nextRunAt, now)))
		.for("update", { skipLocked: true });

	for (const job of dueJobs) {
		const handler = jobHandlers[job.name];
		if (!handler) {
			console.warn(`[Maintenance] Unknown job: ${job.name}`);
			continue;
		}

		try {
			console.log(`[Maintenance] Running job: ${job.name}`);
			await handler();

			// Calculate next run time
			const interval = cronParser.parseExpression(job.cronExpression);
			const nextRun = interval.next().toDate();

			await db
				.update(maintenanceJob)
				.set({
					lastRunAt: now,
					nextRunAt: nextRun,
					lastError: null,
				})
				.where(eq(maintenanceJob.id, job.id));

			console.log(`[Maintenance] Completed: ${job.name}, next run: ${nextRun}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[Maintenance] Job ${job.name} failed:`, errorMessage);

			await db
				.update(maintenanceJob)
				.set({ lastError: errorMessage })
				.where(eq(maintenanceJob.id, job.id));
		}
	}
}
```

### 5.3 Integrate with Worker Loop

Update `src/worker/index.ts`:

```typescript
import { runDueMaintenanceJobs } from "./maintenance";

// In pollLoop(), after processing monitors:
async function pollLoop() {
	let maintenanceCheckCounter = 0;

	while (running) {
		// ... existing monitor polling ...

		// Check maintenance jobs every 60 seconds
		maintenanceCheckCounter++;
		if (maintenanceCheckCounter >= 60) {
			await runDueMaintenanceJobs();
			maintenanceCheckCounter = 0;
		}
	}
}
```

### Success Criteria

- [ ] Maintenance jobs migrate to worker
- [ ] Jobs run on schedule with cron expressions
- [ ] Failed jobs don't block other jobs
- [ ] Job status visible in database

---

## Stage 6: Remove In-Process Scheduler

**Goal:** Clean up old scheduler and update hooks **Status:** Not Started

### 6.1 Update `hooks.server.ts`

Remove scheduler initialization:

```typescript
// src/hooks.server.ts
// REMOVE: if (!building) void scheduler.start();
```

### 6.2 Archive Old Scheduler

Move `src/lib/server/jobs/scheduler.ts` to
`src/lib/server/jobs/scheduler.ts.deprecated` for reference during migration,
then delete after validation.

### 6.3 Update Monitor CRUD

When monitors are created/updated, set `next_check_at`:

```typescript
// In monitor creation
await db.insert(monitor).values({
	...data,
	nextCheckAt: new Date(), // Check immediately
});

// In monitor update (if interval changed)
await db
	.update(monitor)
	.set({
		...data,
		nextCheckAt: sql`NOW()`, // Reset schedule
	})
	.where(eq(monitor.id, id));

// In monitor activation
await db
	.update(monitor)
	.set({
		active: true,
		nextCheckAt: sql`NOW()`,
		checkRetryCount: 0,
		checkLastError: null,
		checkBackoffUntil: null,
	})
	.where(eq(monitor.id, id));
```

### Success Criteria

- [ ] Scheduler removed from `hooks.server.ts`
- [ ] Monitor CRUD updates `next_check_at` appropriately
- [ ] No orphaned cron jobs
- [ ] Old scheduler code archived then removed

---

## Stage 7: Docker and Deployment

**Goal:** Configure production deployment with worker container **Status:** Not
Started

### 7.1 Update Dockerfile

```dockerfile
# Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# ... existing build stages ...

FROM base AS production
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./

# Default to web server, override for worker
CMD ["bun", "run", "./build/index.js"]
```

### 7.2 Docker Compose

```yaml
# docker-compose.yml
services:
  app:
    image: ghcr.io/neonrook/uppity:latest
    command: ["bun", "run", "./build/index.js"]
    environment:
      DATABASE_URL: "${DATABASE_URL}"
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  worker:
    image: ghcr.io/neonrook/uppity:latest
    command: ["bun", "run", "./build/worker.js"]
    environment:
      DATABASE_URL: "${DATABASE_URL}"
      UPPITY_WORKER_BATCH_SIZE: "10"
    depends_on:
      - postgres
    restart: unless-stopped
    deploy:
      replicas: 2 # Horizontal scaling

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: uppity
      POSTGRES_USER: uppity
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 7.3 Railway Configuration

For Railway deployment, add a second service pointing to the same repo with
different start command:

```toml
# railway.toml (worker service)
[build]
builder = "DOCKERFILE"

[deploy]
startCommand = "bun run ./build/worker.js"
healthcheckPath = ""  # Worker has no HTTP endpoint
restartPolicyType = "ON_FAILURE"
```

### Success Criteria

- [ ] Docker build produces both web and worker artifacts
- [ ] Docker Compose runs both services
- [ ] Railway deploys both services from same repo
- [ ] Worker scales horizontally without conflicts

---

## Testing Strategy

### Unit Tests

```typescript
// src/worker/index.spec.ts
describe("Worker", () => {
	describe("claimDueMonitors", () => {
		it("claims up to batch size monitors");
		it("skips monitors in backoff");
		it("skips inactive monitors");
		it("uses SKIP LOCKED to prevent conflicts");
	});

	describe("handleCheckFailure", () => {
		it("increments retry count");
		it("calculates exponential backoff correctly");
		it("enters dead letter after max retries");
	});
});
```

### Integration Tests

```typescript
// src/worker/integration.spec.ts
describe("Worker Integration", () => {
	it("processes monitors without duplicates across workers");
	it("recovers from worker crash");
	it("handles database connection loss");
});
```

### Load Tests

- Run 2+ workers against shared database
- Create 1000+ monitors with 30s intervals
- Verify no duplicate checks
- Measure claim latency under load

---

## Rollback Plan

If issues arise after deployment:

1. **Immediate:** Scale worker replicas to 0
2. **Restore:** Re-enable in-process scheduler in `hooks.server.ts`
3. **Investigate:** Review worker logs and database state
4. **Fix:** Address issues, redeploy worker

The `next_check_at` column is backwards-compatible - the old scheduler ignores
it, so rollback is safe.

---

## Open Items

- [ ] Add Prometheus metrics endpoint to worker
- [ ] Implement admin UI for dead letter management
- [ ] Add worker health check for Railway
- [ ] Document runbook for common failure scenarios
