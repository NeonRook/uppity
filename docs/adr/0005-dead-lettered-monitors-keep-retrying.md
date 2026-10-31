---
status: accepted
date: 2026-10-06
---

# Dead-lettered monitors keep retrying

A monitor whose checks keep failing inside Uppity is dead-lettered, and dead letter no
longer parks it. It keeps retrying at the capped backoff. The state is shown to the
customer, sent to their notification channels, and logged for the operator.

## Context

Dead letter is about the checker failing, not the target. `executeCheck` throwing (a
database error, a bug in a probe, an unexpected exception) is what counts. A target that
is down produces a successful check whose result is `down` and never reaches this path.

Before this decision, the `UPPITY_CHECK_MAX_RETRIES`th consecutive failure pushed
`next_check_at` and `check_backoff_until` out by `UPPITY_DEAD_LETTER_HOURS` (24 by
default) and wrote `Dead letter: …` to `check_last_error`. Nothing else happened. Reading
the code confirmed two suspicions from NEO-73:

- The retry count did not reset when the window ended. The next failure computed
  `retry_count + 1 >= MAX_ATTEMPTS` and re-entered dead letter at once, so a single fault
  after the window bought another 24 hours with no checks.
- Editing a monitor cleared the backoff only when the edit reactivated it or changed its
  interval. Any other edit left the window in place. Pausing and resuming cleared it,
  because resuming takes the same branch.

During the window the dashboard, the monitor pages and the public status page kept
showing the last recorded status. For a monitor last seen up, that was a day of false
"operational".

## Decision

**No blind window.** Dead letter changes how failures are reported, not how often the
monitor is tried. Retries follow the existing exponential backoff, capped at
`UPPITY_CHECK_BACKOFF_MAX_MS` (5 minutes by default). `UPPITY_DEAD_LETTER_HOURS` is
removed.

**A claim is a short lease.** Claiming a monitor sets `check_backoff_until` to the
check's worst case: every attempt timing out, each followed by the pause before the
next, plus 30 seconds for the writes. That is 61 seconds for a monitor with the default
30-second timeout and no retries. The `monitor_lease_seconds` SQL function is the one
definition (`docs/adr/0007-one-result-processor.md`). `next_check_at` keeps the time the
check was due. A worker that dies mid-check, or fails to record the result, leaves the
lease to run out, and the monitor is claimed again. Before this, a claim pushed
`next_check_at` out by an hour.

The longest a monitor goes without an attempt is therefore the backoff cap, or one lease
when an attempt is abandoned. The worker also releases, at startup and with its
periodic maintenance jobs, any active monitor scheduled further out than its interval or
the cap plus a lease, which no current code path writes.

**Dead letter is a column, not a count.** `monitor.dead_lettered_at` is set by the failure
that reaches `MAX_ATTEMPTS` and cleared by the next successful check. The retry count keeps
climbing and only sizes the backoff. Entry is "threshold reached and the column is null",
so each episode notifies once however many retries fail after it.

**Entry and recovery are notification events.** Entry enqueues `monitor_checks_stopped`.
The first success after it enqueues `monitor_checks_resumed`. Both go through the outbox in
the same transaction as the monitor update. Every enabled channel linked to the monitor
receives them, with no per-channel toggle, because the message is that monitoring itself
has stopped.

**The stale status is not shown.** In the app an active dead-lettered monitor reads "Not
checked" in the `status-unknown` gray, with the time of the next attempt, or "now" while
one is due or running. On the public status page it reads `unknown`, and any `unknown`
monitor replaces "All systems operational" with "Some systems are not being monitored
right now". Outages and degradation still take precedence over that banner. An active
maintenance window does not: it explains why a monitor may be down, not that it is being
checked, so a dead-lettered monitor in a window still reads `unknown`. The
`monitor_checks_stopped` webhook carries no status for the same reason.

A paused monitor is outside this. The app shows it as Paused, and the public page keeps
showing its last recorded status, whether or not it was dead-lettered when paused.

**The operator hears through the log and the ops alert.** Entry logs at error level
with `event_type: "monitor_dead_lettered"`. The notifier also reads the active
dead-lettered monitors on each sweep and sends one operator alert listing them, so a
dying monitor worker cannot lose the alert and a fault that breaks every check sends one
message rather than one per monitor. The cooldown follows the newest entry into dead
letter: a new failure, or a monitor that recovered and failed again, alerts at the next
sweep, and an unchanged set repeats after `UPPITY_OPS_ALERT_COOLDOWN_HOURS`. The alert
carries IDs and a link to the admin page, since monitor names and check errors are
customer text.

**An admin reset means "retry now".** It makes the monitor due immediately and leaves
`dead_lettered_at` set. A success then sends the recovery notification, and a failure
stays in dead letter without a second entry notification.

## Consequences

A fault that breaks every check, such as a bad probe release, dead-letters every monitor
it reaches and sends one notification per monitor. Each one is true, but together they
are noisy. The operator alert is where the common cause shows.

A dead-lettered monitor now costs one attempt per backoff cap instead of none for a day.
At the 5-minute default that is 288 attempts a day, the same as a monitor on a 5-minute
interval.

The public banner turns gray for any page holding a monitor that has never been checked,
which includes a monitor created seconds ago, until its first check lands. That is
accurate, and it is a change from before.

Monitors parked under the old window are made due by the migration. Their next failure
enters dead letter under these rules and notifies. A monitor an older worker parks while
both versions run is released by the schedule bound above.

The workers deploy alongside the web tier, whose pre-deploy step runs the migrations, so
they can start before `dead_lettered_at` exists. Until it does, the monitor worker checks
and backs off as usual without tracking dead letter, and the notifier reads only the
monitor columns it sends. A notification whose dispatch throws, such as on a lost
database connection, stays claimed and is retried by the next sweep once the claim is
five minutes old, rather than being marked failed.

Dead letter is itself a database write. If the monitor worker cannot write to the
database, nothing records the failure: each monitor is retried once per lease, the app
keeps showing its last status, and the monitors go overdue. The notifier raises
`monitor_checks_overdue`, or, when it cannot read the database either, the same alert
with the query's error.
