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
removed. The longest a monitor goes without an attempt is the cap.

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
checked" in the `status-unknown` gray, with the time of the next attempt. On the public
status page it reads `unknown`, and any `unknown` monitor replaces "All systems
operational" with "Some systems are not being monitored right now". Outages and
degradation still take precedence over that banner.

**The operator hears through the log.** Entry logs at error level with
`event_type: "monitor_dead_lettered"`. A Railway log alert on that field is the operator
alert until NEO-67 provides a channel.

**An admin reset means "retry now".** It makes the monitor due immediately and leaves
`dead_lettered_at` set. A success then sends the recovery notification, and a failure
stays in dead letter without a second entry notification.

## Consequences

A fault that breaks every check, such as a bad probe release, dead-letters every monitor
it reaches and sends one notification per monitor. Each one is true, but together they
are noisy. The operator log alert is where the common cause shows.

A dead-lettered monitor now costs one attempt per backoff cap instead of none for a day.
At the 5-minute default that is 288 attempts a day, the same as a monitor on a 5-minute
interval.

The public banner turns gray for any page holding a monitor that has never been checked,
which includes a monitor created seconds ago, until its first check lands. That is
accurate, and it is a change from before.

Monitors parked under the old window are made due by the migration. Their next failure
enters dead letter under these rules and notifies.

## Revisit when

NEO-67 adds an operator alert channel. The `monitor_dead_lettered` event should go there
rather than depend on a log match.
