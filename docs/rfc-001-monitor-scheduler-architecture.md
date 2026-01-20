# RFC-001: Monitor Scheduler Architecture

**Status:** Draft **Author:** Claude **Created:** 2026-01-20

## Summary

This RFC explores alternatives to the current in-process cron-based monitor
scheduler. The goal is to find a more robust, scalable architecture that
separates background job processing from the SvelteKit web server.

## Current Architecture

The scheduler currently runs inside the SvelteKit process, initialized in
`hooks.server.ts`:

```typescript
// src/hooks.server.ts
if (!building) void scheduler.start();
```

The `Scheduler` class in `src/lib/server/jobs/scheduler.ts`:

- Uses `node-cron` to schedule monitor checks based on `intervalSeconds`
- Maintains an in-memory queue of pending checks
- Processes checks sequentially from the queue
- Runs maintenance jobs (daily stats, rolling stats, cleanup)

### Problems with Current Approach

1. **Coupling**: Background jobs are tightly coupled to web request handling
2. **Horizontal scaling**: Multiple SvelteKit instances would each run their own
   scheduler, causing duplicate checks
3. **Fault isolation**: A crash in the scheduler affects web serving, and vice
   versa
4. **Resource contention**: Monitoring jobs compete with web requests for
   CPU/memory
5. **Cold starts**: Serverless deployments would need persistent instances for
   scheduling
6. **State management**: In-memory job state is lost on restart; monitors need
   re-syncing
7. **Limited concurrency**: Single-threaded queue processes checks sequentially

---

## Option A: Standalone Bun Worker (Sidecar)

Extract the scheduler into a separate Bun process that runs alongside the web
server.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   SvelteKit     │     │   Bun Worker    │
│   Web Server    │     │   (Scheduler)   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────┴──────┐
              │  PostgreSQL │
              └─────────────┘
```

### Implementation

Create a new entry point `src/worker/scheduler.ts`:

```typescript
import { db } from "$lib/server/db";
import { monitor } from "$lib/server/db/schema";
import { checkService } from "$lib/server/services/check.service";
import { eq, and, lte } from "drizzle-orm";

// Poll database for monitors due for checking
async function pollMonitors() {
	const now = new Date();
	const dueMonitors = await db
		.select()
		.from(monitor)
		.where(
			and(
				eq(monitor.active, true),
				lte(monitor.nextCheckAt, now), // New column needed
			),
		);

	for (const m of dueMonitors) {
		await runCheck(m);
	}
}

// Main loop
setInterval(pollMonitors, 5000);
```

### Database Changes

Add a `next_check_at` column to the `monitor` table:

```sql
ALTER TABLE monitor ADD COLUMN next_check_at TIMESTAMP;
CREATE INDEX monitor_next_check_idx ON monitor (next_check_at) WHERE active = true;
```

### Docker Compose

```yaml
services:
  app:
    image: ghcr.io/neonrook/uppity:latest
    command: ["bun", "run", "./build/index.js"]
    # ... web config

  worker:
    image: ghcr.io/neonrook/uppity:latest
    command: ["bun", "run", "./build/worker.js"]
    environment:
      DATABASE_URL: "${DATABASE_URL}"
    restart: unless-stopped
```

### Pros

- Clean separation of concerns
- Independent scaling (run multiple workers with locking)
- Fault isolation between web and worker
- Same codebase and dependencies
- Easy local development (run both processes)

### Cons

- Need coordination for horizontal scaling (row-level locking or leader
  election)
- Additional deployment complexity (two containers)
- Shared code must be carefully structured to work in both contexts

### Horizontal Scaling Strategy

Use PostgreSQL advisory locks or `SELECT ... FOR UPDATE SKIP LOCKED`:

```typescript
const [m] = await db.execute(sql`
  SELECT * FROM monitor
  WHERE active = true AND next_check_at <= NOW()
  ORDER BY next_check_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
`);
```

---

## Option B: PostgreSQL pg_cron + pg_notify

Use PostgreSQL's native `pg_cron` extension to trigger checks, with `pg_notify`
to communicate results back to the application.

### Architecture

```
┌─────────────────┐
│   SvelteKit     │◄────── LISTEN/NOTIFY
│   Web Server    │
└────────┬────────┘
         │
   ┌─────┴─────┐
   │ PostgreSQL │
   │  + pg_cron │
   │  + functions│
   └───────────┘
```

### Implementation

Create a PostgreSQL function for health checks:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http; -- for HTTP checks

CREATE OR REPLACE FUNCTION perform_monitor_check(monitor_id TEXT)
RETURNS void AS $$
DECLARE
  m RECORD;
  result RECORD;
BEGIN
  SELECT * INTO m FROM monitor WHERE id = monitor_id;

  -- Perform HTTP check using http extension
  SELECT * INTO result FROM http_get(m.url);

  -- Insert check result
  INSERT INTO monitor_check (id, monitor_id, status, status_code, response_time_ms, checked_at)
  VALUES (gen_random_uuid(), monitor_id,
    CASE WHEN result.status = 200 THEN 'up' ELSE 'down' END,
    result.status,
    EXTRACT(MILLISECONDS FROM result.response_time),
    NOW());

  -- Notify application of status change
  PERFORM pg_notify('monitor_check', json_build_object(
    'monitor_id', monitor_id,
    'status', result.status
  )::text);
END;
$$ LANGUAGE plpgsql;

-- Schedule checks dynamically
SELECT cron.schedule(
  'check-' || id,
  '* * * * *', -- Every minute
  'SELECT perform_monitor_check(''' || id || ''')'
) FROM monitor WHERE active = true;
```

### Pros

- No additional services to deploy
- Scheduling survives application restarts
- Native PostgreSQL guarantees (ACID, durability)
- Built-in horizontal scaling via database

### Cons

- **Limited check types**: `http` extension is basic; TCP checks and complex
  HTTP (headers, body validation) are difficult
- **No Bun runtime**: Can't use `Bun.connect()` for TCP checks
- **Notification complexity**: Complex business logic (incidents, notifications)
  harder in PL/pgSQL
- **Extension dependencies**: Requires `pg_cron` and `http` extensions (not
  available on all hosts)
- **Debugging difficulty**: PL/pgSQL is harder to debug than TypeScript
- **Vendor lock-in**: Tied to PostgreSQL-specific features

---

## Option C: pgBoss (PostgreSQL Job Queue)

Use [pgBoss](https://github.com/timgit/pg-boss) as a job queue backed by
PostgreSQL.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   SvelteKit     │     │   Bun Worker    │
│   (Producer)    │     │   (Consumer)    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────┴──────┐
              │  PostgreSQL │
              │   (pgBoss)  │
              └─────────────┘
```

### Implementation

```typescript
// src/lib/server/jobs/boss.ts
import PgBoss from "pg-boss";

export const boss = new PgBoss(process.env.DATABASE_URL!);

// Producer: Schedule monitor checks
export async function scheduleMonitorCheck(monitorId: string, intervalSeconds: number) {
	await boss.schedule(
		`monitor-check-${monitorId}`,
		`*/${Math.max(1, Math.floor(intervalSeconds / 60))} * * * *`,
		{ monitorId },
	);
}

// Consumer: Worker process
async function startWorker() {
	await boss.start();

	await boss.work("monitor-check-*", async (job) => {
		const { monitorId } = job.data;
		const monitor = await getMonitor(monitorId);
		const result = await checkService.performCheckWithRetries(monitor);
		await checkService.saveCheckResult(monitorId, result);
	});
}
```

### Pros

- Uses existing PostgreSQL (no new infrastructure)
- Built-in scheduling, retries, and dead-letter queues
- Automatic job distribution across workers
- ACID guarantees on job state
- Well-maintained library with good TypeScript support

### Cons

- Additional dependency (`pg-boss`)
- Still requires separate worker process
- Job table adds database overhead
- Less real-time than in-memory solutions

---

## Option D: BullMQ with Redis

Use [BullMQ](https://docs.bullmq.io/) with Redis for high-performance job
scheduling.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   SvelteKit     │     │   Bun Worker    │
│   (Producer)    │     │   (Consumer)    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────┴────┐           ┌──────┴──────┐
    │  Redis  │           │  PostgreSQL │
    │ (Queue) │           │   (Data)    │
    └─────────┘           └─────────────┘
```

### Implementation

```typescript
// src/lib/server/jobs/queue.ts
import { Queue, Worker } from "bullmq";

const connection = { host: "localhost", port: 6379 };

export const monitorQueue = new Queue("monitor-checks", { connection });

// Add repeatable jobs for each monitor
export async function scheduleMonitor(monitorId: string, intervalMs: number) {
	await monitorQueue.add(
		"check",
		{ monitorId },
		{
			repeat: { every: intervalMs },
			jobId: `monitor-${monitorId}`,
		},
	);
}

// Worker process
const worker = new Worker(
	"monitor-checks",
	async (job) => {
		const { monitorId } = job.data;
		const monitor = await getMonitor(monitorId);
		const result = await checkService.performCheckWithRetries(monitor);
		await checkService.saveCheckResult(monitorId, result);
	},
	{ connection, concurrency: 10 },
);
```

### Pros

- Battle-tested at scale (millions of jobs)
- True concurrency with configurable workers
- Rate limiting, retries, priorities built-in
- Real-time job progress and events
- Excellent TypeScript support

### Cons

- **Requires Redis**: Additional infrastructure to deploy and maintain
- Additional dependency
- Two data stores to manage (Redis + PostgreSQL)
- Redis persistence configuration needed for durability

---

## Option E: Database Polling with Distributed Locking

Simple polling loop with PostgreSQL advisory locks for coordination.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Bun Worker 1  │     │   Bun Worker N  │
│   (Scheduler)   │     │   (Scheduler)   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────┴──────┐
              │  PostgreSQL │
              │ (Data+Lock) │
              └─────────────┘
```

### Implementation

```typescript
// src/worker/scheduler.ts
import { db } from "$lib/server/db";
import { sql } from "drizzle-orm";

async function claimAndExecuteCheck(): Promise<boolean> {
	// Atomic claim using SKIP LOCKED
	const result = await db.execute(sql`
    WITH claimed AS (
      SELECT id FROM monitor
      WHERE active = true
        AND next_check_at <= NOW()
      ORDER BY next_check_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE monitor m
    SET next_check_at = NOW() + (interval_seconds || ' seconds')::interval
    FROM claimed
    WHERE m.id = claimed.id
    RETURNING m.*
  `);

	if (result.rows.length === 0) return false;

	const monitor = result.rows[0] as Monitor;
	const checkResult = await checkService.performCheckWithRetries(monitor);
	await checkService.saveCheckResult(monitor.id, checkResult);
	return true;
}

// Main loop - run continuously
async function runScheduler() {
	while (true) {
		const hadWork = await claimAndExecuteCheck();
		if (!hadWork) {
			await sleep(1000); // Back off when no work
		}
	}
}

runScheduler();
```

### Database Changes

```sql
ALTER TABLE monitor ADD COLUMN next_check_at TIMESTAMP DEFAULT NOW();
CREATE INDEX monitor_due_checks_idx ON monitor (next_check_at)
  WHERE active = true;
```

### Pros

- Minimal dependencies (just PostgreSQL)
- Natural horizontal scaling via `SKIP LOCKED`
- Self-healing (if worker dies, another picks up work)
- Precise scheduling (updates `next_check_at` atomically)
- Simple mental model

### Cons

- Polling overhead (mitigated with backoff)
- Requires schema change
- No built-in retry/dead-letter features (must implement)

---

## Recommendation

**Option E (Database Polling with Distributed Locking)** is recommended for the
following reasons:

1. **Minimal infrastructure**: No new services (Redis) or extensions (pg_cron)
2. **Natural horizontal scaling**: `SKIP LOCKED` distributes work automatically
3. **Fault tolerant**: Monitors are re-checked if a worker crashes
4. **Simple deployment**: Just add a worker container
5. **Bun compatible**: Full access to Bun APIs for TCP checks
6. **Precise timing**: `next_check_at` column provides exact scheduling

### Migration Path

1. Add `next_check_at` column to `monitor` table
2. Create new `src/worker/index.ts` entry point
3. Extract check logic to shared module
4. Update Docker Compose to run worker alongside app
5. Remove scheduler from `hooks.server.ts`
6. Add health check endpoint for worker

### Future Enhancements

- Add worker health monitoring
- Implement retry with exponential backoff for failed checks
- Add metrics/observability (OpenTelemetry)
- Consider Option D (BullMQ) if Redis is later added for caching

---

## Alternatives Considered but Rejected

### Serverless Functions (AWS Lambda, Cloudflare Workers)

- **Problem**: Cold starts make sub-minute checks unreliable
- **Problem**: Each function invocation is isolated; no connection pooling
- **Problem**: Cost scales linearly with check frequency

### External Cron Services (EasyCron, cron-job.org)

- **Problem**: External dependency for core functionality
- **Problem**: Limited to HTTP triggers
- **Problem**: Security concerns with webhook endpoints

### Temporal.io / Durable Execution

- **Problem**: Significant infrastructure overhead for this use case
- **Problem**: Overkill for simple periodic checks

---

## Open Questions

1. Should the worker share the same Docker image as the web app, or be a
   separate build? -> Depends on how bun builds work. If
   `bun build packages/worker.ts` generates something we can deploy separately,
   then a 2nd image is good.
2. What's the desired check frequency granularity? (Current: seconds, minimum
   useful: ~5 seconds) -> At the most 30s or or, anything less is too much data.
3. Should maintenance jobs (stats aggregation, cleanup) also move to the worker?
   -> Yes
4. How should worker failures be monitored and alerted? -> Automatically,
   ideally. Leveraging Railway for this would be best

---

## References

- [pgBoss Documentation](https://github.com/timgit/pg-boss)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [PostgreSQL SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [pg_cron Extension](https://github.com/citusdata/pg_cron)
